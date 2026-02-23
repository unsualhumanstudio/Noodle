// Noodle - Background Service Worker

// Registry of active AbortControllers keyed by requestId — lets us cancel in-flight fetches
const activeControllers = {};

// Sync storage flag with actual permission state on startup
chrome.permissions.contains({ origins: ['<all_urls>'] }, (hasPermission) => {
  chrome.storage.local.set({ noodleAllSites: hasPermission });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'requestAllSitesPermission') {
    chrome.permissions.request({
      origins: ['<all_urls>']
    }, (granted) => {
      if (granted) {
        // Save the setting
        chrome.storage.local.set({ noodleAllSites: true });
        // Inject into current tab if needed
        if (sender.tab) {
          injectIntoTab(sender.tab.id);
        }
      }
      sendResponse({ granted });
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'revokeAllSitesPermission') {
    chrome.permissions.remove({
      origins: ['<all_urls>']
    }, (removed) => {
      if (removed) {
        chrome.storage.local.set({ noodleAllSites: false });
      }
      sendResponse({ removed });
    });
    return true;
  }

  if (message.type === 'checkAllSitesPermission') {
    chrome.permissions.contains({
      origins: ['<all_urls>']
    }, (hasPermission) => {
      sendResponse({ hasPermission });
    });
    return true;
  }

  if (message.type === 'noodleAiCancel') {
    const ctrl = activeControllers[message.requestId];
    if (ctrl) {
      ctrl.abort();
      delete activeControllers[message.requestId];
    }
    return false;
  }

  if (message.type === 'noodleAiRequest') {
    handleAiRequest(message, sender);
    return true;
  }

  if (message.type === 'noodleAiResearchRequest') {
    handleResearchRequest(message, sender);
    return true;
  }

  if (message.type === 'noodleEnhanceTask') {
    handleEnhanceTask(message, sender);
    return true;
  }
});

// Handle AI API requests with streaming
async function handleAiRequest(message, sender) {
  const { requestId, systemPrompt, messages } = message;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const result = await chrome.storage.local.get('noodleApiKey');
  const apiKey = result.noodleApiKey;

  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamError',
      requestId,
      error: 'No API key configured. Add your Claude API key in Settings.'
    });
    return;
  }

  const controller = new AbortController();
  activeControllers[requestId] = controller;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      chrome.tabs.sendMessage(tabId, {
        type: 'noodleAiStreamError',
        requestId,
        error: `API error (${response.status}): ${errorText}`
      });
      return;
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamStart',
      requestId
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              chrome.tabs.sendMessage(tabId, {
                type: 'noodleAiStreamDelta',
                requestId,
                text: parsed.delta.text
              });
            }
          } catch (e) {
            // Skip unparseable lines
          }
        }
      }
    }

    delete activeControllers[requestId];
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamEnd',
      requestId
    });

  } catch (err) {
    delete activeControllers[requestId];
    // AbortError means the user stopped generation — send a clean end, not an error
    if (err.name === 'AbortError') {
      chrome.tabs.sendMessage(tabId, { type: 'noodleAiStreamEnd', requestId });
    } else {
      chrome.tabs.sendMessage(tabId, {
        type: 'noodleAiStreamError',
        requestId,
        error: err.message
      });
    }
  }
}

// Handle research requests with tool use loop (Claude + Tavily)
async function handleResearchRequest(message, sender) {
  const { requestId, systemPrompt, messages } = message;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const stored = await chrome.storage.local.get(['noodleApiKey', 'noodleTavilyKey']);
  const apiKey = stored.noodleApiKey;
  const tavilyKey = stored.noodleTavilyKey;

  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamError', requestId,
      error: 'No API key configured. Add your Claude API key in Settings.'
    });
    return;
  }

  if (!tavilyKey) {
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamError', requestId,
      error: 'No Tavily API key configured. Add it in Settings to use research mode.'
    });
    return;
  }

  // Tool definition for Claude
  const tools = [{
    name: 'search_web',
    description: 'Search the web for current information relevant to the user\'s question. Use this to find up-to-date facts, articles, or data that complement the user\'s saved snippets.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A focused search query (under 200 chars). Be specific to get high-quality results.'
        }
      },
      required: ['query']
    }
  }];

  // AbortController for this request
  const controller = new AbortController();
  activeControllers[requestId] = controller;

  // Accumulated web citations: [{index, url, title, favicon}]
  const webCitations = [];
  let webCitIndex = 1;

  // Mutable copy of messages for the tool use loop
  let loopMessages = [...messages];
  const MAX_TOOL_ROUNDS = 8; // allow enough rounds for multi-search commands like /market

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // On the final round, force Claude to synthesize by disabling tools
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: isLastRound
            ? [...loopMessages, { role: 'user', content: 'You have completed your research. Now write your final answer using only what you have gathered so far.' }]
            : loopMessages,
          // On last round, omit tools so Claude is forced to respond with text
          ...(isLastRound ? {} : { tools }),
          stream: false
        }),
        signal: controller.signal
      });
    } catch (err) {
      delete activeControllers[requestId];
      if (err.name === 'AbortError') {
        chrome.tabs.sendMessage(tabId, { type: 'noodleAiStreamEnd', requestId });
      } else {
        chrome.tabs.sendMessage(tabId, { type: 'noodleAiStreamError', requestId, error: err.message });
      }
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      chrome.tabs.sendMessage(tabId, {
        type: 'noodleAiStreamError', requestId,
        error: `API error (${response.status}): ${errorText}`
      });
      return;
    }

    const data = await response.json();

    // If Claude wants to use a tool
    if (data.stop_reason === 'tool_use') {
      // Append Claude's response (with tool_use content blocks) to loop messages
      loopMessages.push({ role: 'assistant', content: data.content });

      // Process each tool use block
      const toolResults = [];
      for (const block of data.content) {
        if (block.type !== 'tool_use' || block.name !== 'search_web') continue;

        const query = block.input?.query || '';

        // Notify content script: "Researching..."
        chrome.tabs.sendMessage(tabId, {
          type: 'noodleAiToolCall',
          requestId,
          toolName: 'search_web',
          query
        });

        // Call Tavily — keep results small to avoid blowing the Claude TPM limit
        let tavilyResults = [];
        try {
          const tavilyResp = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: tavilyKey,
              query,
              search_depth: 'basic',
              max_results: 3,
              include_answer: false
            })
          });
          if (tavilyResp.ok) {
            const tavilyData = await tavilyResp.json();
            tavilyResults = tavilyData.results || [];
          }
        } catch (e) {
          // Tavily failed — continue with empty results
          tavilyResults = [];
        }

        // Build tool result content for Claude + register web citations
        // Keep snippet short (150 chars) to limit context growth across rounds
        let resultContent = '';
        if (tavilyResults.length === 0) {
          resultContent = 'No results found for this query.';
        } else {
          tavilyResults.forEach(r => {
            const idx = webCitIndex++;
            webCitations.push({ index: idx, url: r.url, title: r.title || r.url });
            resultContent += `{W${idx}} ${r.title || r.url}\nURL: ${r.url}\nContent: ${(r.content || '').substring(0, 150)}\n\n`;
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: resultContent.trim()
        });
      }

      // Append tool results and pause briefly to avoid hitting Claude's TPM rate limit
      loopMessages.push({ role: 'user', content: toolResults });
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue; // next round — Claude will now synthesize
    }

    // stop_reason is 'end_turn' (or anything else) — stream the final answer
    // Send accumulated web citations to the content script first
    if (webCitations.length > 0) {
      chrome.tabs.sendMessage(tabId, {
        type: 'noodleAiWebCitations',
        requestId,
        citations: webCitations
      });
    }

    // Now stream the final text content
    // Re-request with stream:true to get the streaming response
    // (We already have data.content for the non-streaming final answer — stream it manually)
    chrome.tabs.sendMessage(tabId, { type: 'noodleAiStreamStart', requestId });

    // Extract text blocks from the non-streamed response and send as deltas
    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        // Send in chunks to simulate streaming feel
        const chunkSize = 80;
        for (let i = 0; i < block.text.length; i += chunkSize) {
          chrome.tabs.sendMessage(tabId, {
            type: 'noodleAiStreamDelta',
            requestId,
            text: block.text.slice(i, i + chunkSize)
          });
        }
      }
    }

    delete activeControllers[requestId];
    chrome.tabs.sendMessage(tabId, { type: 'noodleAiStreamEnd', requestId });
    return;
  }

  // Exhausted all rounds without end_turn — clean up
  delete activeControllers[requestId];
}

// Handle task enhancement with AI — returns structured JSON with sourced segments
async function handleEnhanceTask(message, sender) {
  const { requestId, taskTitle, pageContext, userNotes, mentionedFolders, allFolders, pageUrl, pageTitle } = message;
  const tabId = sender.tab?.id;
  if (!tabId) return;

  const result = await chrome.storage.local.get('noodleApiKey');
  const apiKey = result.noodleApiKey;

  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleEnhanceError',
      requestId,
      error: 'No API key configured. Add your Claude API key in Settings.'
    });
    return;
  }

  const systemPrompt = `You are a smart task assistant that enhances task notes by synthesizing page context, user notes, and relevant project snippets.

You must return ONLY valid JSON — no markdown, no code fences, no explanation.

Return this exact structure:
{
  "segments": [
    { "text": "...", "source": null },
    { "text": "...", "source": { "type": "page", "preview": "..." } },
    { "text": "...", "source": { "type": "snippet", "folder": "FolderName", "preview": "..." } },
    { "text": "...", "source": { "type": "user", "preview": "..." } }
  ],
  "suggestedMentions": ["FolderName1", "FolderName2"]
}

Rules:
- Each segment is a short phrase or sentence (not a full paragraph)
- source.type can be: "page" (from page context), "snippet" (from a folder's snippets), "user" (from user's notes), or null (general synthesis)
- source.preview is a brief excerpt (max 80 chars) from the source that justifies this segment
- suggestedMentions lists folder names that are clearly relevant but not already #mentioned by the user
- Keep the user's voice and intent — enhance, don't replace
- Weave user notes and page context together naturally
- Be concise: aim for 2-4 sentences total across all segments`;

  const folderContext = allFolders.length > 0
    ? allFolders.map(f => `Folder "#${f.name}" contains snippets:\n${f.snippets.map(s => `- "${s.text.substring(0, 100)}"`).join('\n')}`).join('\n\n')
    : 'No folders/snippets available.';

  const userMessage = `Task title: "${taskTitle}"
Source page: ${pageTitle || 'Unknown'} (${pageUrl || 'no URL'})
Page context (surrounding text where the task was created):
"${pageContext || 'No page context available'}"

User's existing notes:
"${userNotes || 'None'}"

Already #mentioned folders: ${mentionedFolders.length > 0 ? mentionedFolders.join(', ') : 'None'}

Available project folders and their snippets:
${folderContext}

Please enhance the notes for this task.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      chrome.tabs.sendMessage(tabId, {
        type: 'noodleEnhanceError',
        requestId,
        error: `API error (${response.status}): ${errorText}`
      });
      return;
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      // Try to extract JSON from response if wrapped in anything
      const match = rawText.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!parsed || !Array.isArray(parsed.segments)) {
      chrome.tabs.sendMessage(tabId, {
        type: 'noodleEnhanceError',
        requestId,
        error: 'AI returned an unexpected format. Please try again.'
      });
      return;
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'noodleEnhanceDone',
      requestId,
      segments: parsed.segments,
      suggestedMentions: parsed.suggestedMentions || []
    });

  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleEnhanceError',
      requestId,
      error: err.message
    });
  }
}

// Inject content script into a tab
function injectIntoTab(tabId) {
  chrome.scripting.insertCSS({
    target: { tabId },
    files: ['src/styles.css']
  }).catch(() => {});

  chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content.js']
  }).catch(() => {});
}

// When permission is granted, inject into all matching tabs
chrome.permissions.onAdded.addListener((permissions) => {
  if (permissions.origins?.includes('<all_urls>')) {
    // Inject into all open tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          injectIntoTab(tab.id);
        }
      });
    });
  }
});

// Handle new tabs when all-sites mode is enabled
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Skip chrome:// and extension pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }

    // Skip claude.ai - it's already handled by manifest content_scripts
    if (tab.url.includes('claude.ai')) {
      return;
    }

    // Check if we have all-sites permission (this is the source of truth)
    chrome.permissions.contains({
      origins: ['<all_urls>']
    }, (hasPermission) => {
      if (hasPermission) {
        // Check if already injected by checking for our element
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => !!document.querySelector('.claude-highlighter-toggle')
        }).then((results) => {
          if (results && results[0] && !results[0].result) {
            injectIntoTab(tabId);
          }
        }).catch(() => {});
      }
    });
  }
});
