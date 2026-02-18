// Noodle - Background Service Worker

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

  if (message.type === 'noodleAiRequest') {
    handleAiRequest(message, sender);
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
      })
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

    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamEnd',
      requestId
    });

  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      type: 'noodleAiStreamError',
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
