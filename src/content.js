// Noodle - Content Script
(function() {
  'use strict';

  // Default color labels (user can customize)
  const DEFAULT_COLOR_LABELS = {
    blue: 'Ideas',
    green: 'Copy',
    coral: 'Questions',
    yellow: 'Notes'
  };

  const COLORS = {
    blue: '#D2DBF2',
    green: '#D2F2ED',
    coral: '#FED7CE',
    yellow: '#F0E7A8'
  };

  let snippets = [];
  let folders = [];
  let colorLabels = { ...DEFAULT_COLOR_LABELS };
  let togglePosition = null; // { x, y } or null for default
  let toolbar = null;
  let sidebar = null;
  let toggle = null;
  let currentSelection = null;
  let activeFilter = 'all'; // 'all', 'blue', 'green', 'coral'
  let activeFolder = 'all'; // 'all' or folder id

  // Container for our UI (protected from React)
  let noodleRoot = null;

  // AI Command Bar state
  let aiOverlay = null;
  let aiCurrentChatId = null;
  let aiChatHistory = [];
  let aiSelectedFolderIds = ['all']; // ['all'] or array of folder IDs / 'unfiled'
  let aiIsStreaming = false;
  let aiCurrentRequestId = null;
  let aiStreamBuffer = '';
  let aiHistoryOpen = false;

  // Initialize
  function init() {
    try {
      // Create a protected container for our UI
      createNoodleRoot();
      createSidebar();
      createToggle();
      setupSelectionListener();
      setupAiShortcut();
      setupAiMessageListener();
      loadData(() => {
        // After data is loaded, check if we need to highlight something
        checkForHighlightRequest();
      });

      // Watch for our root being removed and re-inject
      setupDOMWatcher();
    } catch (e) {
      console.error('Noodle init error:', e);
    }
  }

  // Create a protected root container for Noodle UI
  function createNoodleRoot() {
    if (noodleRoot && document.body.contains(noodleRoot)) return;

    noodleRoot = document.createElement('div');
    noodleRoot.id = 'noodle-root';
    noodleRoot.setAttribute('data-noodle', 'true');
    document.body.appendChild(noodleRoot);
  }

  // Watch for our root being removed and re-inject
  function setupDOMWatcher() {
    // Use interval as backup since MutationObserver might miss some changes
    setInterval(() => {
      if (!document.getElementById('noodle-root')) {
        noodleRoot = null;
        sidebar = null;
        toggle = null;
        createNoodleRoot();
        createSidebar();
        createToggle();
        loadData();
      }
    }, 500);
  }

  // Check if we were navigated here to highlight specific text
  function checkForHighlightRequest() {
    const hash = window.location.hash;
    if (hash.startsWith('#noodle-highlight=')) {
      const snippetId = decodeURIComponent(hash.substring('#noodle-highlight='.length));
      // Clean up the URL first
      history.replaceState(null, '', window.location.pathname + window.location.search);

      // Check if we have this snippet
      const snippet = snippets.find(s => s.id === snippetId);
      if (!snippet) {
        console.log('Noodle: Snippet not found in storage:', snippetId, 'Total snippets:', snippets.length);
        return;
      }

      // Then find and highlight
      scrollToAndHighlightSnippet(snippetId);
    }
  }

  // Scroll to and temporarily highlight a snippet's text
  function scrollToAndHighlightSnippet(snippetId) {
    const snippet = snippets.find(s => s.id === snippetId);
    if (!snippet || !snippet.anchor) {
      showToast('Snippet not found');
      return;
    }

    // Try multiple times for dynamic content (Slack, Teams, Gmail, etc.)
    let attempts = 0;
    const maxAttempts = 15;
    const delays = [200, 400, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000];

    function tryHighlight() {
      const range = findTextInPage(snippet.anchor);
      if (range) {

        // Create a temporary element to scroll to (handles nested scrollable containers)
        const startContainer = range.startContainer;
        const element = startContainer.nodeType === Node.TEXT_NODE
          ? startContainer.parentElement
          : startContainer;

        // Scroll the element into view (works with nested scrollable containers like Claude's chat)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Apply a temporary "flash" highlight
        applyFlashHighlight(range, snippet.color);
        return true;
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(tryHighlight, delays[attempts] || 1000);
      } else {
        // Show a helpful message with the text they were looking for
        const preview = snippet.text.substring(0, 50) + (snippet.text.length > 50 ? '...' : '');
        showToast(`Could not find: "${preview}"`);
      }
      return false;
    }

    setTimeout(tryHighlight, delays[0]);
  }

  // Apply a temporary flash highlight that fades out
  function applyFlashHighlight(range, color) {
    try {
      const mark = document.createElement('mark');
      mark.className = `claude-highlight claude-highlight-flash ${color}`;
      range.surroundContents(mark);

      // Remove the flash class after animation
      setTimeout(() => {
        mark.classList.remove('claude-highlight-flash');
      }, 2000);

      // Remove the highlight entirely after a longer period
      setTimeout(() => {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        }
      }, 5000);
    } catch (e) {
      // If surroundContents fails, try the complex approach
      try {
        highlightRangeComplexFlash(range, color);
      } catch (e2) {
        console.log('Could not apply flash highlight:', e2);
      }
    }
  }

  // Handle flash highlighting that crosses element boundaries
  function highlightRangeComplexFlash(range, color) {
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
              range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    const marks = [];
    textNodes.forEach(textNode => {
      let startOffset = 0;
      let endOffset = textNode.textContent.length;

      if (textNode === range.startContainer) {
        startOffset = range.startOffset;
      }
      if (textNode === range.endContainer) {
        endOffset = range.endOffset;
      }

      const highlightRange = document.createRange();
      highlightRange.setStart(textNode, startOffset);
      highlightRange.setEnd(textNode, endOffset);

      const mark = document.createElement('mark');
      mark.className = `claude-highlight claude-highlight-flash ${color}`;
      highlightRange.surroundContents(mark);
      marks.push(mark);
    });

    // Remove flash class after animation
    setTimeout(() => {
      marks.forEach(mark => mark.classList.remove('claude-highlight-flash'));
    }, 2000);

    // Remove highlights entirely after longer period
    setTimeout(() => {
      marks.forEach(mark => {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        }
      });
    }, 5000);
  }

  // Load all data from storage
  function loadData(callback) {
    try {
      chrome.storage.local.get(['claudeHighlights', 'claudeFolders', 'claudeColorLabels', 'noodleTogglePosition'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Noodle storage error:', chrome.runtime.lastError);
          return;
        }
        snippets = result.claudeHighlights || [];
        folders = result.claudeFolders || [];
        colorLabels = result.claudeColorLabels || { ...DEFAULT_COLOR_LABELS };
        togglePosition = result.noodleTogglePosition || null;
        updateBadge();
        updateTogglePosition();
        renderSidebar();
        if (callback) callback();
      });
    } catch (e) {
      console.error('Noodle loadData error:', e);
    }
  }

  // Save toggle position
  function saveTogglePosition() {
    chrome.storage.local.set({ noodleTogglePosition: togglePosition });
  }

  // Update toggle button position (Y-axis only; X is fixed to right edge)
  function updateTogglePosition() {
    if (!toggle) return;
    if (togglePosition && togglePosition.y != null) {
      const rect = toggle.getBoundingClientRect();
      const maxY = window.innerHeight - rect.height - 8;
      const clampedY = Math.max(8, Math.min(togglePosition.y, maxY));

      if (clampedY !== togglePosition.y) {
        togglePosition = null;
        chrome.storage.local.remove('noodleTogglePosition');
        toggle.style.top = '';
        toggle.style.bottom = '50%';
        toggle.style.transform = 'translateY(50%)';
      } else {
        toggle.style.bottom = 'auto';
        toggle.style.transform = 'none';
        toggle.style.top = `${clampedY}px`;
      }
    } else {
      toggle.style.top = '';
      toggle.style.bottom = '50%';
      toggle.style.transform = 'translateY(50%)';
    }
  }

  // Save snippets to storage
  function saveSnippets() {
    chrome.storage.local.set({ claudeHighlights: snippets }, () => {
      updateBadge();
      renderSnippets();
    });
  }

  // Save folders to storage
  function saveFolders() {
    chrome.storage.local.set({ claudeFolders: folders }, () => {
      renderSidebar();
    });
  }

  // Save color labels to storage
  function saveColorLabels() {
    chrome.storage.local.set({ claudeColorLabels: colorLabels }, () => {
      renderSidebar();
    });
  }

  // Create the sidebar
  function createSidebar() {
    sidebar = document.createElement('div');
    sidebar.className = 'claude-highlighter-sidebar';
    // Append to our protected root, or body as fallback
    (noodleRoot || document.body).appendChild(sidebar);
    renderSidebar();
  }

  // Render the full sidebar
  function renderSidebar() {
    if (!sidebar) return;

    sidebar.innerHTML = `
      <div class="claude-highlighter-sidebar-header">
        <h2>Noodles</h2>
        <button class="claude-highlighter-close-btn">×</button>
      </div>
      <div class="claude-highlighter-filters">
        <div class="claude-highlighter-color-filters">
          <button class="filter-btn ${activeFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
          <button class="filter-btn ${activeFilter === 'blue' ? 'active' : ''}" data-filter="blue">
            <span class="filter-dot blue"></span>${colorLabels.blue}
          </button>
          <button class="filter-btn ${activeFilter === 'green' ? 'active' : ''}" data-filter="green">
            <span class="filter-dot green"></span>${colorLabels.green}
          </button>
          <button class="filter-btn ${activeFilter === 'coral' ? 'active' : ''}" data-filter="coral">
            <span class="filter-dot coral"></span>${colorLabels.coral}
          </button>
          <button class="filter-btn ${activeFilter === 'yellow' ? 'active' : ''}" data-filter="yellow">
            <span class="filter-dot yellow"></span>${colorLabels.yellow}
          </button>
        </div>
        <div class="claude-highlighter-folder-filter">
          <select class="folder-select">
            <option value="all" ${activeFolder === 'all' ? 'selected' : ''}>All Folders</option>
            <option value="unfiled" ${activeFolder === 'unfiled' ? 'selected' : ''}>Unfiled</option>
            ${folders.map(f => `<option value="${f.id}" ${activeFolder === f.id ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
          </select>
          <button class="add-folder-btn">+</button>
        </div>
      </div>
      <div class="claude-highlighter-snippets"></div>
      <div class="claude-highlighter-footer">
        <button class="settings-btn">Settings</button>
      </div>
    `;

    // Event listeners
    sidebar.querySelector('.claude-highlighter-close-btn').addEventListener('click', () => {
      sidebar.classList.remove('open');
      toggle.classList.remove('docked');
      toggle.querySelectorAll('.noodle-toggle-btn').forEach(b => b.classList.remove('active'));
    });

    sidebar.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeFilter = e.currentTarget.dataset.filter;
        renderSidebar();
      });
    });

    sidebar.querySelector('.folder-select').addEventListener('change', (e) => {
      activeFolder = e.target.value;
      renderSnippets();
    });

    sidebar.querySelector('.add-folder-btn').addEventListener('click', () => {
      showNewFolderDialog();
    });

    sidebar.querySelector('.settings-btn').addEventListener('click', () => {
      showSettingsDialog();
    });

    // Tooltips for sidebar buttons
    setupTooltip(sidebar.querySelector('.claude-highlighter-close-btn'), 'Close');
    setupTooltip(sidebar.querySelector('.add-folder-btn'), 'New folder');
    setupTooltip(sidebar.querySelector('.settings-btn'), 'Settings');

    renderSnippets();
  }

  // Track which panel mode is active: 'snippets' | 'chat'
  let sidebarMode = 'snippets';

  // Create the toggle pill
  function createToggle() {
    toggle = document.createElement('div');
    toggle.className = 'claude-highlighter-toggle';
    toggle.innerHTML = `
      <button class="noodle-toggle-btn" id="noodle-btn-snippets" title="Noodles">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F0ED95" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 3.5c5-2 7 2.5 3 4C1.5 10 2 15 5 16c5 2 9-10 14-7s.5 13.5-4 12c-5-2.5.5-11 6-2"/>
        </svg>
        <span class="badge" style="display:none;">0</span>
      </button>
      <div class="noodle-toggle-divider"></div>
      <button class="noodle-toggle-btn" id="noodle-btn-think" title="Think">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 64 64" style="width:24px;height:24px;">
          <path fill="#ffdd67" d="M4 30c0 15.5 12.5 28 28 28s28-12.5 28-28S47.5 2 32 2S4 14.5 4 30"/>
          <path fill="#917524" d="M14.2 12c3.4-2 7.5-2.3 11.3-1c.5.2 1.3-1.7.7-1.9c-4.3-1.6-9-1.2-13 1.1c-.6.3.5 2.1 1 1.8m24 3c3.4-2 7.5-2.3 11.3-1c.5.2 1.3-1.7.7-1.9c-4.3-1.6-9-1.2-13 1.1c-.6.3.5 2 1 1.8"/>
          <path fill="#664e27" d="M24.1 34.7c5.1-1.3 10.7-.4 15 2.6c1.1.7-.9 3.5-2 2.7c-2.9-1.9-7.4-3.3-12.1-2.1c-1.2.3-2.2-2.8-.9-3.2"/>
          <path fill="#fff" d="M42.8 29.1c-4.1 0-7.5-3.4-7.5-7.5c0-1.7.6-3.3 1.5-4.5c1.7-.5 3.6-.7 5.6-.7c2.4 0 4.7.4 6.7 1.1c.8 1.2 1.3 2.6 1.3 4.2c-.1 4.1-3.4 7.4-7.6 7.4"/>
          <path fill="#664e27" d="M43.8 16.4c.4.6.7 1.3.7 2.1c0 2.1-1.7 3.8-3.8 3.8S37 20.6 37 18.6c0-.6.1-1.1.4-1.6c1.5-.4 3.2-.6 5-.6z"/>
          <path fill="#fff" d="M21.2 29.1c-4.1 0-7.5-3.4-7.5-7.5c0-1.7.6-3.3 1.5-4.5c1.7-.5 3.6-.7 5.6-.7c2.4 0 4.7.4 6.7 1.1c.8 1.2 1.3 2.6 1.3 4.2c-.1 4.1-3.5 7.4-7.6 7.4"/>
          <path fill="#664e27" d="M22.2 16.4c.4.6.7 1.3.7 2.1c0 2.1-1.7 3.8-3.8 3.8s-3.8-1.7-3.8-3.8c0-.6.1-1.1.4-1.6c1.5-.4 3.2-.6 5-.6c.6.1 1 .1 1.5.1"/>
          <path fill="#fff" d="M32.6 44c-4.2 1-14.9 2.3-16.8.3c-.9-.9-.7-2.2-.4-4.5s-1.9-4.7-3.5-4.9c-1.9-.2-3 1.2-2.3 3.2C11 42.6 8.2 44 8 47.3c-.1 1.9-.7 5.1 2.2 9.2c3.3 4.6 9 4.7 11 4.6c2.3-.1 3.3-.2 3.8-1.2c.6-1.2.3-1.5.6-1.9c.5-.9.8-.8 1.1-1.9s-.5-1.8-.3-2.3c.4-1.2 1.4-1 .4-3.8c3.4-.5 5.6-1 7.6-2.2c3.7-2 .5-4.3-1.8-3.8"/>
        </svg>
      </button>
    `;
    document.body.appendChild(toggle);

    // Drag state
    let isDragging = false;
    let hasMoved = false;
    let dragStartX, dragStartY;
    let toggleStartY;

    toggle.addEventListener('mousedown', (e) => {
      // Don't start drag on button clicks
      if (e.target.closest('.noodle-toggle-btn')) return;
      isDragging = true;
      hasMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = toggle.getBoundingClientRect();
      toggleStartY = rect.top;

      toggle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaY = e.clientY - dragStartY;
      if (Math.abs(e.clientX - dragStartX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
      }

      let newY = toggleStartY + deltaY;
      const rect = toggle.getBoundingClientRect();
      newY = Math.max(8, Math.min(newY, window.innerHeight - rect.height - 8));

      toggle.style.bottom = 'auto';
      toggle.style.transform = 'none';
      toggle.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      toggle.style.cursor = '';

      if (hasMoved) {
        const rect = toggle.getBoundingClientRect();
        togglePosition = { y: rect.top };
        saveTogglePosition();
      }
    });

    // Noodle button — open snippets panel
    toggle.querySelector('#noodle-btn-snippets').addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasMoved) return;
      openPanel('snippets');
    });

    // Think button — open chat panel
    toggle.querySelector('#noodle-btn-think').addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasMoved) return;
      openPanel('chat');
    });

    setupTooltip(toggle.querySelector('#noodle-btn-snippets'), 'Noodles');
    setupTooltip(toggle.querySelector('#noodle-btn-think'), 'Think');
  }

  function openPanel(mode) {
    const isOpen = sidebar.classList.contains('open');
    const isSameMode = sidebarMode === mode;

    if (isOpen && isSameMode) {
      // Toggle closed
      sidebar.classList.remove('open');
      toggle.classList.remove('docked');
      toggle.querySelector(`#noodle-btn-${mode === 'snippets' ? 'snippets' : 'think'}`)?.classList.remove('active');
      return;
    }

    sidebarMode = mode;
    aiHistoryOpen = false; // always start with history closed when opening panel
    sidebar.classList.add('open');
    toggle.classList.add('docked');

    // Update active states
    toggle.querySelector('#noodle-btn-snippets').classList.toggle('active', mode === 'snippets');
    toggle.querySelector('#noodle-btn-think').classList.toggle('active', mode === 'chat');

    if (mode === 'snippets') {
      renderSidebar();
    } else {
      renderChatPanel();
    }
  }

  // Update badge count (on the noodle icon button)
  function updateBadge() {
    const badge = toggle?.querySelector('#noodle-btn-snippets .badge');
    if (badge) {
      if (snippets.length > 0) {
        badge.textContent = snippets.length;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // Get filtered snippets
  function getFilteredSnippets() {
    return snippets.filter(s => {
      const colorMatch = activeFilter === 'all' || s.color === activeFilter;
      const folderMatch = activeFolder === 'all' ||
        (activeFolder === 'unfiled' && !s.folderId) ||
        s.folderId === activeFolder;
      return colorMatch && folderMatch;
    });
  }

  // Render snippets in sidebar
  function renderSnippets() {
    const container = sidebar?.querySelector('.claude-highlighter-snippets');
    if (!container) return;

    const filtered = getFilteredSnippets();

    if (filtered.length === 0) {
      const noResults = snippets.length > 0 && filtered.length === 0;
      container.innerHTML = `
        <div class="claude-highlighter-empty">
          <p>${noResults ? 'No snippets match filters' : 'No snippets saved yet'}</p>
          ${!noResults ? '<p style="font-size: 12px; margin-top: 8px;">Highlight text and click a color to save</p>' : ''}
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map((snippet) => {
      const folder = folders.find(f => f.id === snippet.folderId);
      const snippetIndex = snippets.findIndex(s => s.id === snippet.id);
      const faviconUrl = snippet.favicon || getFaviconUrl(snippet.url);

      return `
        <div class="claude-highlighter-snippet ${snippet.color}" data-index="${snippetIndex}" data-id="${snippet.id}">
          <div class="claude-highlighter-snippet-header">
            <span class="snippet-label ${snippet.color}">${colorLabels[snippet.color]}</span>
            ${folder ? `<span class="snippet-folder">${escapeHtml(folder.name)}</span>` : ''}
          </div>
          <div class="claude-highlighter-snippet-text">${escapeHtml(snippet.text)}</div>
          <div class="snippet-note-section" data-id="${snippet.id}">
            ${snippet.note
              ? `<div class="snippet-note-display">
                  <div class="snippet-note-text">${escapeHtml(snippet.note)}</div>
                  <button class="snippet-note-edit-btn" title="Edit note">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                  </button>
                </div>`
              : `<button class="snippet-add-note-btn">+ Add note</button>`
            }
          </div>
          <div class="claude-highlighter-snippet-meta">
            <div class="snippet-meta-left">
              <button class="snippet-source-link" data-url="${escapeHtml(snippet.url)}" data-id="${snippet.id}">
                <img src="${faviconUrl}" alt="" class="snippet-favicon" onerror="this.style.display='none'">
              </button>
              <span>${formatDate(snippet.timestamp)}</span>
            </div>
            <div class="claude-highlighter-snippet-actions">
              <button class="claude-highlighter-snippet-btn folder-btn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/></svg></button>
              <button class="claude-highlighter-snippet-btn copy-btn"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg></button>
              <button class="claude-highlighter-snippet-btn delete-btn">×</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners
    container.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.closest('.claude-highlighter-snippet').dataset.index);
        copyToClipboard(snippets[index].text);
        showToast('Copied!');
      });
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const snippetEl = e.target.closest('.claude-highlighter-snippet');
        const index = parseInt(snippetEl.dataset.index);
        snippets.splice(index, 1);
        saveSnippets();
        showToast('Deleted');
      });
    });

    container.querySelectorAll('.folder-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const snippetEl = e.target.closest('.claude-highlighter-snippet');
        const id = snippetEl.dataset.id;
        showFolderPicker(id, e.target);
      });
      setupTooltip(btn, 'Move to folder');
    });

    container.querySelectorAll('.copy-btn').forEach(btn => {
      setupTooltip(btn, 'Copy to clipboard');
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
      setupTooltip(btn, 'Delete');
    });

    container.querySelectorAll('.snippet-source-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.url;
        const snippetId = link.dataset.id;
        const currentBaseUrl = getBaseUrl(window.location.href);
        const targetBaseUrl = getBaseUrl(url);

        if (currentBaseUrl === targetBaseUrl) {
          // Same page - just scroll and highlight
          scrollToAndHighlightSnippet(snippetId);
          sidebar.classList.remove('open');
        } else {
          // Different page - open with hash to trigger highlight
          const targetUrl = url + '#noodle-highlight=' + encodeURIComponent(snippetId);
          window.open(targetUrl, '_blank');
        }
      });
      setupTooltip(link, 'Go to source');
    });

    // Add note button handlers
    container.querySelectorAll('.snippet-add-note-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const noteSection = e.target.closest('.snippet-note-section');
        const snippetId = noteSection.dataset.id;
        showNoteEditor(noteSection, snippetId, '');
      });
    });

    // Edit note button handlers
    container.querySelectorAll('.snippet-note-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const noteSection = e.target.closest('.snippet-note-section');
        const snippetId = noteSection.dataset.id;
        const snippet = snippets.find(s => s.id === snippetId);
        showNoteEditor(noteSection, snippetId, snippet?.note || '');
      });
    });
  }

  // Show folder picker dropdown
  function showFolderPicker(snippetId, anchorEl) {
    // Remove any existing picker
    document.querySelector('.folder-picker')?.remove();

    const picker = document.createElement('div');
    picker.className = 'folder-picker';
    picker.innerHTML = `
      <div class="folder-picker-item" data-folder="">Unfiled</div>
      ${folders.map(f => `<div class="folder-picker-item" data-folder="${f.id}">${escapeHtml(f.name)}</div>`).join('')}
      <div class="folder-picker-divider"></div>
      <div class="folder-picker-item new-folder">+ New Folder</div>
    `;

    document.body.appendChild(picker);

    const rect = anchorEl.getBoundingClientRect();
    const pickerRect = picker.getBoundingClientRect();

    // Position below the button
    let top = rect.bottom + 4;
    let left = rect.left;

    // Keep within viewport - align to right edge if it would overflow
    if (left + pickerRect.width > window.innerWidth - 16) {
      left = rect.right - pickerRect.width;
    }

    picker.style.top = `${top}px`;
    picker.style.left = `${left}px`;

    picker.querySelectorAll('.folder-picker-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.classList.contains('new-folder')) {
          picker.remove();
          showNewFolderDialog((newFolderId) => {
            if (newFolderId) {
              moveSnippetToFolder(snippetId, newFolderId);
            }
          });
        } else {
          const folderId = item.dataset.folder || null;
          moveSnippetToFolder(snippetId, folderId);
          picker.remove();
        }
      });
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', function closePicker(e) {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', closePicker);
        }
      });
    }, 0);
  }

  // Move snippet to folder
  function moveSnippetToFolder(snippetId, folderId) {
    const snippet = snippets.find(s => s.id === snippetId);
    if (snippet) {
      snippet.folderId = folderId;
      saveSnippets();
      showToast(folderId ? 'Moved to folder' : 'Moved to Unfiled');
    }
  }

  // Show note editor inline
  function showNoteEditor(noteSection, snippetId, existingNote) {
    noteSection.innerHTML = `
      <div class="snippet-note-editor">
        <textarea class="snippet-note-input" placeholder="Add a note...">${escapeHtml(existingNote)}</textarea>
        <div class="snippet-note-editor-actions">
          <span class="snippet-note-status"></span>
          <button class="snippet-note-done-btn">Done</button>
        </div>
      </div>
    `;

    const textarea = noteSection.querySelector('.snippet-note-input');
    const doneBtn = noteSection.querySelector('.snippet-note-done-btn');
    const statusEl = noteSection.querySelector('.snippet-note-status');

    textarea.focus();
    // Move cursor to end of text
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Auto-save on typing (debounced)
    let saveTimeout = null;
    textarea.addEventListener('input', () => {
      statusEl.textContent = 'Saving...';
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveNote(snippetId, textarea.value);
        statusEl.textContent = 'Saved';
        setTimeout(() => {
          if (statusEl) statusEl.textContent = '';
        }, 1500);
      }, 500);
    });

    // Done button closes the editor
    doneBtn.addEventListener('click', () => {
      clearTimeout(saveTimeout);
      saveNote(snippetId, textarea.value);
      renderSnippets();
    });

    // Escape key closes the editor
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearTimeout(saveTimeout);
        saveNote(snippetId, textarea.value);
        renderSnippets();
      }
    });
  }

  // Save note to snippet
  function saveNote(snippetId, noteText) {
    const snippet = snippets.find(s => s.id === snippetId);
    if (snippet) {
      snippet.note = noteText.trim() || null;
      chrome.storage.local.set({ claudeHighlights: snippets });
    }
  }

  // Show new folder dialog
  function showNewFolderDialog(callback) {
    const dialog = document.createElement('div');
    dialog.className = 'claude-highlighter-dialog-overlay';
    dialog.innerHTML = `
      <div class="claude-highlighter-dialog">
        <h3>New Folder</h3>
        <input type="text" class="dialog-input" placeholder="Folder name" autofocus>
        <div class="dialog-actions">
          <button class="dialog-btn cancel">Cancel</button>
          <button class="dialog-btn primary">Create</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const input = dialog.querySelector('input');
    input.focus();

    const create = () => {
      const name = input.value.trim();
      if (name) {
        const newFolder = { id: Date.now().toString(), name };
        folders.push(newFolder);
        saveFolders();
        showToast('Folder created');
        if (callback) callback(newFolder.id);
      }
      dialog.remove();
    };

    dialog.querySelector('.cancel').addEventListener('click', () => {
      dialog.remove();
      if (callback) callback(null);
    });

    dialog.querySelector('.primary').addEventListener('click', create);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') create();
      if (e.key === 'Escape') {
        dialog.remove();
        if (callback) callback(null);
      }
    });
  }

  // Show settings dialog
  async function showSettingsDialog() {
    // Check current all-sites permission status and API key
    let hasAllSites = false;
    let hasApiKey = false;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'checkAllSitesPermission' });
      hasAllSites = response?.hasPermission || false;
    } catch (e) {
      // Extension context may not be available
    }
    try {
      const result = await new Promise(resolve => chrome.storage.local.get('noodleApiKey', resolve));
      hasApiKey = !!result.noodleApiKey;
    } catch (e) {}

    const dialog = document.createElement('div');
    dialog.className = 'claude-highlighter-dialog-overlay';
    dialog.innerHTML = `
      <div class="claude-highlighter-dialog settings-dialog">
        <h3>Settings</h3>
        <div class="settings-section">
          <h4>AI (Claude API)</h4>
          <div class="api-key-row" style="display:flex;gap:6px;align-items:center;">
            <input type="password" class="dialog-input api-key-input" style="flex:1;font-size:12px;"
                   placeholder="sk-ant-..." value="${hasApiKey ? '••••••••' : ''}" />
            <button class="dialog-btn api-key-save-btn" style="padding:8px 12px;font-size:12px;">
              ${hasApiKey ? 'Update' : 'Save'}
            </button>
            ${hasApiKey ? '<button class="dialog-btn api-key-clear-btn" style="padding:8px 10px;font-size:12px;color:#e74c3c;">Clear</button>' : ''}
          </div>
          <p class="settings-hint">Your API key is stored locally and used for AI features.</p>
        </div>
        <div class="settings-section">
          <h4>Availability</h4>
          <label class="toggle-row">
            <span>Enable on all websites</span>
            <input type="checkbox" class="all-sites-toggle" ${hasAllSites ? 'checked' : ''}>
            <span class="toggle-switch"></span>
          </label>
          <p class="settings-hint">When enabled, Noodle works on any website, not just Claude</p>
        </div>
        <div class="settings-section">
          <h4>Color Labels</h4>
          <div class="color-label-row">
            <span class="filter-dot blue"></span>
            <input type="text" class="dialog-input" data-color="blue" value="${escapeHtml(colorLabels.blue)}">
          </div>
          <div class="color-label-row">
            <span class="filter-dot green"></span>
            <input type="text" class="dialog-input" data-color="green" value="${escapeHtml(colorLabels.green)}">
          </div>
          <div class="color-label-row">
            <span class="filter-dot coral"></span>
            <input type="text" class="dialog-input" data-color="coral" value="${escapeHtml(colorLabels.coral)}">
          </div>
          <div class="color-label-row">
            <span class="filter-dot yellow"></span>
            <input type="text" class="dialog-input" data-color="yellow" value="${escapeHtml(colorLabels.yellow)}">
          </div>
        </div>
        <div class="settings-section">
          <h4>Folders</h4>
          <div class="folders-list">
            ${folders.length === 0 ? '<p class="no-folders">No folders yet</p>' :
              folders.map(f => `
                <div class="folder-row" data-id="${f.id}">
                  <span>${escapeHtml(f.name)}</span>
                  <button class="delete-folder-btn">×</button>
                </div>
              `).join('')}
          </div>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn cancel">Cancel</button>
          <button class="dialog-btn primary">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // All-sites toggle handler
    const allSitesToggle = dialog.querySelector('.all-sites-toggle');
    allSitesToggle.addEventListener('change', async (e) => {
      try {
        if (e.target.checked) {
          const response = await chrome.runtime.sendMessage({ type: 'requestAllSitesPermission' });
          if (!response?.granted) {
            e.target.checked = false;
            showToast('Permission not granted');
          }
        } else {
          await chrome.runtime.sendMessage({ type: 'revokeAllSitesPermission' });
        }
      } catch (err) {
        e.target.checked = !e.target.checked;
        showToast('Could not change permission');
      }
    });

    // API key save handler
    dialog.querySelector('.api-key-save-btn')?.addEventListener('click', () => {
      const keyInput = dialog.querySelector('.api-key-input');
      const key = keyInput?.value.trim();
      if (key && key !== '••••••••') {
        chrome.storage.local.set({ noodleApiKey: key }, () => {
          showToast('API key saved');
          keyInput.value = '••••••••';
        });
      }
    });

    // API key clear handler
    dialog.querySelector('.api-key-clear-btn')?.addEventListener('click', () => {
      chrome.storage.local.remove('noodleApiKey', () => {
        showToast('API key removed');
        const keyInput = dialog.querySelector('.api-key-input');
        if (keyInput) keyInput.value = '';
        dialog.querySelector('.api-key-clear-btn')?.remove();
      });
    });

    // Delete folder handlers
    dialog.querySelectorAll('.delete-folder-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const row = e.target.closest('.folder-row');
        const folderId = row.dataset.id;
        // Move snippets in this folder to unfiled
        snippets.forEach(s => {
          if (s.folderId === folderId) s.folderId = null;
        });
        folders = folders.filter(f => f.id !== folderId);
        row.remove();
        if (folders.length === 0) {
          dialog.querySelector('.folders-list').innerHTML = '<p class="no-folders">No folders yet</p>';
        }
      });
    });

    dialog.querySelector('.cancel').addEventListener('click', () => dialog.remove());

    dialog.querySelector('.primary').addEventListener('click', () => {
      // Save color labels
      dialog.querySelectorAll('.color-label-row input').forEach(input => {
        const color = input.dataset.color;
        const value = input.value.trim();
        if (value) colorLabels[color] = value;
      });
      saveColorLabels();
      saveFolders();
      saveSnippets();
      dialog.remove();
      showToast('Settings saved');
    });
  }

  // Setup text selection listener
  function setupSelectionListener() {
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
  }

  function handleSelection(e) {
    // Ignore if clicking inside our UI
    if (e.target.closest('.claude-highlighter-toolbar') ||
        e.target.closest('.claude-highlighter-sidebar') ||
        e.target.closest('.claude-highlighter-toggle') ||
        e.target.closest('.claude-highlighter-dialog-overlay') ||
        e.target.closest('.folder-picker') ||
        e.target.closest('.noodle-ai-overlay')) {
      return;
    }

    // Remove existing toolbar
    removeToolbar();

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length < 3) return;

    // Check if we have a valid range
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Check if we're in a valid content area
    const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

    // Skip if selection is in our own UI or in input/textarea elements
    if (element.closest('.claude-highlighter-toolbar, .claude-highlighter-sidebar, .claude-highlighter-toggle, .claude-highlighter-dialog-overlay, .folder-picker, .noodle-ai-overlay')) {
      return;
    }
    if (element.closest('input, textarea, [contenteditable="true"]')) {
      return;
    }

    currentSelection = {
      text,
      range: range.cloneRange()
    };

    showToolbar(range);
  }

  function showToolbar(range) {
    const rect = range.getBoundingClientRect();

    toolbar = document.createElement('div');
    toolbar.className = 'claude-highlighter-toolbar';
    toolbar.innerHTML = `
      <button class="claude-highlighter-color-btn blue" data-color="blue" title="${colorLabels.blue}"></button>
      <button class="claude-highlighter-color-btn green" data-color="green" title="${colorLabels.green}"></button>
      <button class="claude-highlighter-color-btn coral" data-color="coral" title="${colorLabels.coral}"></button>
      <button class="claude-highlighter-color-btn yellow" data-color="yellow" title="${colorLabels.yellow}"></button>
    `;

    document.body.appendChild(toolbar);

    // Position toolbar snug below the selection end
    const toolbarRect = toolbar.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 4;
    let left = rect.right + window.scrollX - toolbarRect.width;

    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarRect.width - 8));

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;

    // Add click handlers and tooltips
    toolbar.querySelectorAll('.claude-highlighter-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = e.target.dataset.color;
        saveHighlight(color);
      });
      const color = btn.dataset.color;
      setupTooltip(btn, colorLabels[color]);
    });

    // Close toolbar on click outside (with delay to allow button clicks)
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
  }

  function handleClickOutside(e) {
    if (!toolbar?.contains(e.target)) {
      removeToolbar();
      document.removeEventListener('mousedown', handleClickOutside);
    }
  }

  function removeToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  // Get favicon URL for a given page URL
  function getFaviconUrl(pageUrl) {
    try {
      const url = new URL(pageUrl);
      // Use Google's favicon service for reliable favicon fetching
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    } catch (e) {
      return null;
    }
  }

  // Get the base URL (origin + pathname) for matching
  function getBaseUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch (e) {
      return url;
    }
  }

  function saveHighlight(color) {
    if (!currentSelection) return;

    const snippetId = Date.now().toString();

    // Get text anchoring data for persistent highlights
    const anchor = getTextAnchor(currentSelection.range, currentSelection.text);

    const snippet = {
      id: snippetId,
      text: currentSelection.text,
      color: color,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      favicon: getFaviconUrl(window.location.href),
      folderId: null,
      anchor: anchor // Store anchoring data for restoring highlights
    };

    snippets.unshift(snippet);
    saveSnippets();

    // Apply a simple visual highlight to confirm the save
    applySimpleHighlight(currentSelection.range, color);

    removeToolbar();
    window.getSelection().removeAllRanges();
    currentSelection = null;

    showToast(`Saved to ${colorLabels[color]}`);
  }

  // Apply a simple highlight (no animation, stays until page reload)
  function applySimpleHighlight(range, color) {
    try {
      const mark = document.createElement('mark');
      mark.className = `claude-highlight ${color}`;
      range.surroundContents(mark);
    } catch (e) {
      // If surroundContents fails (crosses element boundaries), try complex approach
      try {
        highlightRangeComplexSimple(range, color);
      } catch (e2) {
        console.log('Could not apply highlight:', e2);
      }
    }
  }

  // Handle simple highlighting that crosses element boundaries
  function highlightRangeComplexSimple(range, color) {
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const nodeRange = document.createRange();
          nodeRange.selectNodeContents(node);
          if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
              range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => {
      let startOffset = 0;
      let endOffset = textNode.textContent.length;

      if (textNode === range.startContainer) {
        startOffset = range.startOffset;
      }
      if (textNode === range.endContainer) {
        endOffset = range.endOffset;
      }

      const highlightRange = document.createRange();
      highlightRange.setStart(textNode, startOffset);
      highlightRange.setEnd(textNode, endOffset);

      const mark = document.createElement('mark');
      mark.className = `claude-highlight ${color}`;
      highlightRange.surroundContents(mark);
    });
  }

  // Get text anchoring data for a range
  function getTextAnchor(range, text) {
    try {
      // Get surrounding context for better matching
      const container = range.commonAncestorContainer;
      const textContent = container.textContent || '';
      const rangeText = range.toString();

      // Find the position of the selected text
      const startOffset = textContent.indexOf(rangeText);

      // Get prefix (up to 50 chars before)
      const prefixStart = Math.max(0, startOffset - 50);
      const prefix = textContent.substring(prefixStart, startOffset);

      // Get suffix (up to 50 chars after)
      const suffixEnd = Math.min(textContent.length, startOffset + rangeText.length + 50);
      const suffix = textContent.substring(startOffset + rangeText.length, suffixEnd);

      return {
        text: text,
        prefix: prefix,
        suffix: suffix
      };
    } catch (e) {
      return { text: text, prefix: '', suffix: '' };
    }
  }

  // Find text in the page using anchor data
  function findTextInPage(anchor) {
    if (!anchor || !anchor.text) return null;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip our UI elements
          if (node.parentElement?.closest('.claude-highlighter-sidebar, .claude-highlighter-toggle, .claude-highlighter-toolbar, .claude-highlighter-dialog-overlay')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Build a combined text and map positions to nodes
    let combinedText = '';
    const nodeMap = []; // Array of { node, start, end }

    textNodes.forEach(textNode => {
      const start = combinedText.length;
      combinedText += textNode.textContent;
      nodeMap.push({
        node: textNode,
        start: start,
        end: combinedText.length
      });
    });

    // Normalize whitespace: treat newlines and multiple spaces as single space
    const normalizeWS = (text) => text.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');

    const searchText = anchor.text;
    const normalizedSearch = normalizeWS(searchText);
    const normalizedCombined = normalizeWS(combinedText);

    // Build mapping from normalized positions back to original positions
    const normToOrig = [];
    let lastWasSpace = false;
    for (let i = 0; i < combinedText.length; i++) {
      const char = combinedText[i];
      const isWS = /[\r\n\t ]/.test(char);

      if (isWS) {
        if (!lastWasSpace) {
          normToOrig.push(i);
          lastWasSpace = true;
        }
      } else {
        normToOrig.push(i);
        lastWasSpace = false;
      }
    }
    normToOrig.push(combinedText.length); // End marker

    let searchStart = 0;
    let bestMatch = null;
    let bestScore = -1;

    while (true) {
      const index = normalizedCombined.indexOf(normalizedSearch, searchStart);
      if (index === -1) break;

      // Score this match based on prefix/suffix context
      let score = 0;

      if (anchor.prefix) {
        const normalizedPrefix = normalizeWS(anchor.prefix);
        const prefixInDoc = normalizedCombined.substring(Math.max(0, index - normalizedPrefix.length), index);
        if (prefixInDoc.endsWith(normalizedPrefix) || normalizedPrefix.endsWith(prefixInDoc)) {
          score += prefixInDoc.length;
        }
      }

      if (anchor.suffix) {
        const normalizedSuffix = normalizeWS(anchor.suffix);
        const suffixInDoc = normalizedCombined.substring(index + normalizedSearch.length, index + normalizedSearch.length + normalizedSuffix.length);
        if (suffixInDoc.startsWith(normalizedSuffix) || normalizedSuffix.startsWith(suffixInDoc)) {
          score += suffixInDoc.length;
        }
      }

      if (score > bestScore || bestMatch === null) {
        bestScore = score;
        // Map normalized positions back to original
        const origStart = normToOrig[index] || 0;
        const origEnd = normToOrig[index + normalizedSearch.length] || combinedText.length;
        bestMatch = { index: origStart, length: origEnd - origStart };
      }

      searchStart = index + 1;
    }

    if (!bestMatch) return null;

    // Convert the match position to a Range
    const matchStart = bestMatch.index;
    const matchEnd = matchStart + bestMatch.length;

    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;

    for (const nm of nodeMap) {
      if (!startNode && nm.end > matchStart) {
        startNode = nm.node;
        startOffset = matchStart - nm.start;
      }
      if (nm.end >= matchEnd) {
        endNode = nm.node;
        endOffset = matchEnd - nm.start;
        break;
      }
    }

    if (!startNode || !endNode) return null;

    try {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch (e) {
      return null;
    }
  }

  // Tooltip system
  let tooltipEl = null;
  let tooltipTimeout = null;

  function createTooltip() {
    if (tooltipEl) return;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'noodle-tooltip';
    document.body.appendChild(tooltipEl);
  }

  function showTooltip(target, text) {
    createTooltip();
    clearTimeout(tooltipTimeout);

    tooltipEl.textContent = text;
    tooltipEl.classList.remove('visible');

    // Position tooltip
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let top = rect.top - tooltipRect.height - 6;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

    // Keep within viewport
    if (top < 4) top = rect.bottom + 6;
    left = Math.max(4, Math.min(left, window.innerWidth - tooltipRect.width - 4));

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;

    // Show after brief delay
    tooltipTimeout = setTimeout(() => {
      tooltipEl.classList.add('visible');
    }, 400);
  }

  function hideTooltip() {
    clearTimeout(tooltipTimeout);
    if (tooltipEl) {
      tooltipEl.classList.remove('visible');
    }
  }

  function setupTooltip(element, text) {
    element.addEventListener('mouseenter', () => showTooltip(element, text));
    element.addEventListener('mouseleave', hideTooltip);
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    });
  }

  function showToast(message) {
    // Remove existing toast
    document.querySelector('.claude-highlighter-toast')?.remove();

    const toast = document.createElement('div');
    toast.className = 'claude-highlighter-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  // ===== AI Command Bar =====

  const AI_COMMANDS = [
    { name: '/summarize', desc: 'Summarize selected snippets' },
    { name: '/analyze', desc: 'Deep dive into a snippet' },
    { name: '/compare', desc: 'Compare selected snippets' },
    { name: '/patterns', desc: 'Find recurring themes' },
    { name: '/tags', desc: 'Suggest tags for snippets' },
    { name: '/questions', desc: 'Generate research questions' },
    { name: '/export', desc: 'Export analysis as markdown' },
    { name: '/outline', desc: 'Create outline from snippets' },
    { name: '/gaps', desc: 'Identify missing research areas' },
    { name: '/connect', desc: 'Find non-obvious connections' },
    { name: '/actionable', desc: 'Turn insights into action items' },
    { name: '/cite', desc: 'Format snippets as citations' }
  ];

  function setupAiShortcut() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        e.stopPropagation();
        openPanel('chat');
      }
    });
  }

  function setupAiMessageListener() {
    chrome.runtime.onMessage.addListener((message) => {
      switch (message.type) {
        case 'noodleAiStreamStart':
          handleStreamStart(message.requestId);
          break;
        case 'noodleAiStreamDelta':
          handleStreamDelta(message.requestId, message.text);
          break;
        case 'noodleAiStreamEnd':
          handleStreamEnd(message.requestId);
          break;
        case 'noodleAiStreamError':
          handleStreamError(message.requestId, message.error);
          break;
      }
    });
  }

  function renderChatPanel() {
    if (!sidebar) return;
    closeContextMenu(); // dismiss floating menu if open

    chrome.storage.local.get(['noodleChatHistory', 'noodleApiKey'], (result) => {
      aiChatHistory = result.noodleChatHistory || [];
      const hasApiKey = !!result.noodleApiKey;
      aiSelectedFolderIds = ['all'];
      aiHistoryOpen = false;

      const currentChat = aiCurrentChatId
        ? aiChatHistory.find(c => c.id === aiCurrentChatId)
        : null;
      const isChat = currentChat && currentChat.messages.length > 0;

      sidebar.innerHTML = buildChatPanelHTML(hasApiKey, currentChat, isChat);

      attachAiEventListeners(hasApiKey, isChat);

      const input = sidebar.querySelector('.noodle-ai-input');
      if (input) setTimeout(() => input.focus(), 50);

      if (isChat) {
        const messagesEl = sidebar.querySelector('.noodle-ai-messages');
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }

  function buildChatPanelHTML(hasApiKey, currentChat, isChat) {
    const clockIconSVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

    const headerHTML = `
      <div class="noodle-chat-header">
        <div class="noodle-chat-header-title">
          <span>✨ ${isChat ? escapeHtml(currentChat.title || 'Think') : 'Think'}</span>
        </div>
        <div class="noodle-ai-header-actions">
          ${isChat ? '<button class="noodle-ai-new-chat-btn noodle-ai-header-btn">+ New</button>' : ''}
          <button class="noodle-ai-history-toggle-btn noodle-ai-header-btn ${aiChatHistory.length === 0 ? 'noodle-ai-header-btn-dim' : ''}" title="Chat history" ${aiChatHistory.length === 0 ? 'disabled' : ''}>${clockIconSVG}</button>
          <button class="noodle-chat-close-btn noodle-ai-header-btn">&times;</button>
        </div>
      </div>
    `;

    if (!hasApiKey) {
      return `
        ${headerHTML}
        <div class="noodle-ai-apikey-prompt">
          <p>Enter your Claude API key to use AI features.</p>
          <input type="password" class="noodle-ai-apikey-input" placeholder="sk-ant-..." />
          <button class="noodle-ai-apikey-save">Save Key</button>
          <p style="font-size:11px;color:#999;margin-top:8px;">
            Your key is stored locally and never shared.
          </p>
        </div>
      `;
    }

    const inputBoxHTML = (placeholder) => `
      <div class="noodle-ai-input-area">
        ${snippets.length > 0 ? buildContextChipsHTML() : ''}
        <div class="noodle-ai-input-box">
          <textarea class="noodle-ai-input" placeholder="${placeholder}" rows="1"></textarea>
          <div class="noodle-ai-input-box-footer">
            <div class="noodle-ai-footer-left">
              ${snippets.length > 0 ? `
                <button class="noodle-ai-context-add-btn" title="Add context" aria-label="Add snippet context">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
              ` : ''}
            </div>
            <button class="noodle-ai-send-btn" title="Send">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" d="M5.5 13L18 6m-1.75 17.5h.25a72.7 72.7 0 0 1 6.504-21.962L23.26 1L23 .74l-.538.256A72.7 72.7 0 0 1 .5 7.5v.25l5 5v7.75h.25l1.774-1.69a12 12 0 0 1 2.313-1.723z" stroke-width="1"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    if (isChat) {
      const messagesHTML = currentChat.messages.map(m => buildMessageHTML(m)).join('');
      return `
        ${buildSidebarHistoryHTML()}
        ${headerHTML}
        <div class="noodle-chat-panel">
          <div class="noodle-ai-messages">${messagesHTML}</div>
          ${inputBoxHTML('Ask a follow-up...')}
        </div>
      `;
    }

    // Empty state with suggestions
    return `
      ${buildSidebarHistoryHTML()}
      ${headerHTML}
      <div class="noodle-chat-panel">
        <div class="noodle-chat-empty">
          <div class="noodle-chat-empty-title">What would you like to think through?</div>
          <div class="noodle-chat-empty-hint">Ask anything about your saved snippets, or pick a suggestion below.</div>
          <div class="noodle-chat-suggestions">
            ${['Summarize my snippets', 'Find common themes', 'What are the key insights?', 'Generate action items', 'Find connections between ideas'].map(s =>
              `<button class="noodle-ai-chip" data-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>`
            ).join('')}
          </div>
        </div>
        ${inputBoxHTML('Ask about your snippets...')}
      </div>
    `;
  }

  function buildSidebarHistoryHTML() {
    if (aiChatHistory.length === 0) return '';
    return `
      <div class="noodle-ai-history ${aiHistoryOpen ? 'open' : ''}">
        <div class="noodle-ai-history-header">
          <span>History</span>
          <button class="noodle-ai-history-close-btn" title="Close history">&times;</button>
        </div>
        <div class="noodle-ai-history-list">
          ${aiChatHistory.map(chat => `
            <div class="noodle-ai-history-item ${chat.id === aiCurrentChatId ? 'active' : ''}"
                 data-chat-id="${chat.id}">
              <span class="noodle-ai-history-item-title">${escapeHtml(chat.title || 'Untitled')}</span>
              <span class="noodle-ai-history-date">${formatDate(chat.updatedAt)}</span>
              <button class="noodle-ai-history-delete" data-chat-id="${chat.id}" title="Delete">&times;</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Reset AI state when leaving chat panel
  function closeAiCommandBar() {
    aiHistoryOpen = false;
  }

  // Resolve selected folders to actual snippet IDs
  function getSelectedSnippetIds() {
    if (aiSelectedFolderIds.includes('all')) {
      return snippets.map(s => s.id);
    }
    return snippets.filter(s => {
      if (aiSelectedFolderIds.includes('unfiled') && !s.folderId) return true;
      if (s.folderId && aiSelectedFolderIds.includes(s.folderId)) return true;
      return false;
    }).map(s => s.id);
  }

  function buildContextChipsHTML() {
    const isAll = aiSelectedFolderIds.includes('all');

    if (isAll) {
      const totalCount = snippets.length;
      return `
        <div class="noodle-ai-context-chips">
          <span class="noodle-ai-context-chip" data-folder-id="all">
            All snippets <span class="noodle-ai-chip-count">${totalCount}</span>
            <button class="noodle-ai-chip-remove" data-folder-id="all" title="Remove">&times;</button>
          </span>
        </div>
      `;
    }

    if (aiSelectedFolderIds.length === 0) return '<div class="noodle-ai-context-chips"></div>';

    const unfiledCount = snippets.filter(s => !s.folderId).length;
    const chips = aiSelectedFolderIds.map(id => {
      if (id === 'unfiled') {
        return `<span class="noodle-ai-context-chip" data-folder-id="unfiled">
          Unfiled <span class="noodle-ai-chip-count">${unfiledCount}</span>
          <button class="noodle-ai-chip-remove" data-folder-id="unfiled" title="Remove">&times;</button>
        </span>`;
      }
      const folder = folders.find(f => f.id === id);
      if (!folder) return '';
      const count = snippets.filter(s => s.folderId === id).length;
      return `<span class="noodle-ai-context-chip" data-folder-id="${id}">
        ${escapeHtml(folder.name)} <span class="noodle-ai-chip-count">${count}</span>
        <button class="noodle-ai-chip-remove" data-folder-id="${id}" title="Remove">&times;</button>
      </span>`;
    }).filter(Boolean).join('');

    return `<div class="noodle-ai-context-chips">${chips}</div>`;
  }

  function buildContextMenuInnerHTML() {
    const isAll = aiSelectedFolderIds.includes('all');
    const totalCount = snippets.length;
    const unfiledCount = snippets.filter(s => !s.folderId).length;

    const allItem = `
      <label class="noodle-ai-ctx-menu-item ${isAll ? 'selected' : ''}">
        <input type="checkbox" class="noodle-ai-folder-checkbox" data-folder-id="all" ${isAll ? 'checked' : ''} />
        <span class="noodle-ai-ctx-menu-label">All snippets</span>
        <span class="noodle-ai-ctx-menu-count">${totalCount}</span>
      </label>
    `;

    const unfiledItem = unfiledCount > 0 ? `
      <label class="noodle-ai-ctx-menu-item ${!isAll && aiSelectedFolderIds.includes('unfiled') ? 'selected' : ''}">
        <input type="checkbox" class="noodle-ai-folder-checkbox" data-folder-id="unfiled"
               ${isAll || aiSelectedFolderIds.includes('unfiled') ? 'checked' : ''} ${isAll ? 'disabled' : ''} />
        <span class="noodle-ai-ctx-menu-label">Unfiled</span>
        <span class="noodle-ai-ctx-menu-count">${unfiledCount}</span>
      </label>
    ` : '';

    const folderItems = folders.map(f => {
      const count = snippets.filter(s => s.folderId === f.id).length;
      const isSelected = isAll || aiSelectedFolderIds.includes(f.id);
      return `
        <label class="noodle-ai-ctx-menu-item ${!isAll && isSelected ? 'selected' : ''}">
          <input type="checkbox" class="noodle-ai-folder-checkbox" data-folder-id="${f.id}"
                 ${isSelected ? 'checked' : ''} ${isAll ? 'disabled' : ''} />
          <span class="noodle-ai-ctx-menu-label">${escapeHtml(f.name)}</span>
          <span class="noodle-ai-ctx-menu-count">${count}</span>
        </label>
      `;
    }).join('');

    return `
      <div class="noodle-ai-ctx-menu-title">Add context</div>
      ${allItem}
      ${unfiledItem}
      ${folderItems}
    `;
  }

  function buildSuggestionsHTML() {
    if (snippets.length === 0) {
      return `
        <div class="noodle-ai-suggestions">
          <span style="font-size:12px;color:#888;">Save some snippets first to use AI features.</span>
        </div>
      `;
    }

    const suggestions = [
      'Summarize my snippets',
      'Find common themes',
      'What are the key insights?',
      'Generate action items',
      'Find connections between ideas'
    ];

    return `
      <div class="noodle-ai-suggestions">
        ${suggestions.map(s => `
          <button class="noodle-ai-chip" data-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>
        `).join('')}
      </div>
    `;
  }

  function buildCommandsListHTML() {
    return `
      <div class="noodle-ai-commands">
        <div class="noodle-ai-commands-title">Commands</div>
        ${AI_COMMANDS.slice(0, 4).map(cmd => `
          <div class="noodle-ai-command-item" data-command="${cmd.name}">
            <span class="noodle-ai-command-name">${cmd.name}</span>
            <span class="noodle-ai-command-desc">${cmd.desc}</span>
          </div>
        `).join('')}
        <button class="noodle-ai-show-all-commands noodle-ai-chip" style="margin-top:4px;">
          Show all commands
        </button>
      </div>
    `;
  }

  function buildHistorySidebarHTML() {
    return `
      <div class="noodle-ai-history ${aiHistoryOpen ? 'open' : ''}">
        <div class="noodle-ai-history-header">Chat History</div>
        <div class="noodle-ai-history-list">
          ${aiChatHistory.length === 0
            ? '<div style="padding:12px;font-size:12px;color:#888;text-align:center;">No chats yet</div>'
            : aiChatHistory.map(chat => `
              <div class="noodle-ai-history-item ${chat.id === aiCurrentChatId ? 'active' : ''}"
                   data-chat-id="${chat.id}">
                <button class="noodle-ai-history-delete" data-chat-id="${chat.id}">&times;</button>
                ${escapeHtml(chat.title || 'Untitled')}
                <span class="noodle-ai-history-date">${formatDate(chat.updatedAt)}</span>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  }

  function buildMessageHTML(message) {
    if (message.role === 'user') {
      return `
        <div class="noodle-ai-message user">
          ${escapeHtml(message.content)}
        </div>
      `;
    }

    const rendered = renderAiContent(message.content);
    return `
      <div class="noodle-ai-message assistant">
        ${rendered}
      </div>
    `;
  }

  function renderAiContent(text) {
    let html = escapeHtml(text);

    // Track which citation numbers are used in this response
    const usedCitations = new Set();

    // Convert numbered citations [1], [2] etc. to superscript numbers
    html = html.replace(/\[(\d+)\]/g, (match, num) => {
      const citNum = parseInt(num);
      const citation = aiCitationMap.find(c => c.index === citNum);
      if (!citation) return match;
      const snippet = snippets.find(s => s.id === citation.id);
      if (!snippet) return match;
      usedCitations.add(citNum);
      return `<sup class="noodle-ai-cite" data-snippet-id="${snippet.id}" data-cite-num="${citNum}">[${citNum}]</sup>`;
    });

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Split into paragraphs
    html = html.split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';

      const lines = p.split('\n');
      const isBulletList = lines.every(l => l.match(/^[-*]\s/));
      const isNumberedList = lines.every(l => l.match(/^\d+\.\s/));

      if (isBulletList) {
        const items = lines.map(l => `<li>${l.replace(/^[-*]\s/, '')}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (isNumberedList) {
        const items = lines.map(l => `<li>${l.replace(/^\d+\.\s/, '')}</li>`).join('');
        return `<ol>${items}</ol>`;
      }

      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    // Build Sources footer if any citations were used
    if (usedCitations.size > 0) {
      const sortedCitations = Array.from(usedCitations).sort((a, b) => a - b);
      const sourcesHTML = sortedCitations.map(citNum => {
        const citation = aiCitationMap.find(c => c.index === citNum);
        if (!citation) return '';
        const snippet = snippets.find(s => s.id === citation.id);
        if (!snippet) return '';
        const preview = snippet.text.length > 60
          ? snippet.text.substring(0, 60) + '...'
          : snippet.text;
        return `
          <div class="noodle-ai-source-item" data-snippet-id="${snippet.id}">
            <span class="noodle-ai-source-num">${citNum}</span>
            <span class="noodle-ai-source-chip" style="background:var(--highlight-${snippet.color})">${colorLabels[snippet.color]}</span>
            <span class="noodle-ai-source-text">${escapeHtml(preview)}</span>
          </div>
        `;
      }).join('');

      html += `
        <div class="noodle-ai-sources">
          <div class="noodle-ai-sources-title">Sources</div>
          ${sourcesHTML}
        </div>
      `;
    }

    return html;
  }

  function attachAiEventListeners(hasApiKey, isChat) {
    if (!sidebar) return;
    const root = sidebar;

    // Close panel button
    root.querySelector('.noodle-chat-close-btn')?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      toggle.classList.remove('docked');
      toggle.querySelectorAll('.noodle-toggle-btn').forEach(b => b.classList.remove('active'));
    });

    // API key save
    const apiKeySaveBtn = root.querySelector('.noodle-ai-apikey-save');
    if (apiKeySaveBtn) {
      apiKeySaveBtn.addEventListener('click', () => {
        const input = root.querySelector('.noodle-ai-apikey-input');
        const key = input?.value.trim();
        if (key) {
          chrome.storage.local.set({ noodleApiKey: key }, () => {
            showToast('API key saved');
            renderChatPanel();
          });
        }
      });
      root.querySelector('.noodle-ai-apikey-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') apiKeySaveBtn.click();
      });
      return;
    }

    // Send button and Enter key
    const sendBtn = root.querySelector('.noodle-ai-send-btn');
    const input = root.querySelector('.noodle-ai-input');

    sendBtn?.addEventListener('click', () => handleAiSubmit(input));
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAiSubmit(input);
      }
    });

    // Auto-grow textarea
    function autoGrow() {
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    }
    input?.addEventListener('input', autoGrow);

    // Input autocomplete for commands
    input?.addEventListener('input', () => {
      handleAiInputChange(input);
    });

    // Suggestion chips
    root.querySelectorAll('.noodle-ai-chip[data-suggestion]').forEach(chip => {
      chip.addEventListener('click', () => {
        if (input) input.value = chip.dataset.suggestion;
        handleAiSubmit(input);
      });
    });

    // Context: + button opens/closes the dropdown menu
    attachContextListeners();

    // New chat button
    root.querySelector('.noodle-ai-new-chat-btn')?.addEventListener('click', () => {
      aiCurrentChatId = null;
      renderChatPanel();
    });

    // History toggle
    root.querySelector('.noodle-ai-history-toggle-btn')?.addEventListener('click', () => {
      aiHistoryOpen = !aiHistoryOpen;
      const historyEl = root.querySelector('.noodle-ai-history');
      if (historyEl) historyEl.classList.toggle('open', aiHistoryOpen);
    });

    attachHistoryListeners();

    // Citation superscripts and source items in messages
    attachCitationListeners();
  }

  function attachCitationListeners() {
    if (!sidebar) return;

    // Superscript citation numbers
    sidebar.querySelectorAll('.noodle-ai-cite').forEach(cite => {
      if (!cite.dataset.listenerAttached) {
        cite.dataset.listenerAttached = 'true';
        cite.addEventListener('click', () => {
          const snippetId = cite.dataset.snippetId;
          openPanel('snippets');
          scrollToAndHighlightSnippet(snippetId);
        });
      }
    });

    // Source items in the footer
    sidebar.querySelectorAll('.noodle-ai-source-item').forEach(item => {
      if (!item.dataset.listenerAttached) {
        item.dataset.listenerAttached = 'true';
        item.addEventListener('click', () => {
          const snippetId = item.dataset.snippetId;
          openPanel('snippets');
          scrollToAndHighlightSnippet(snippetId);
        });
      }
    });
  }

  function reattachContextToggle() {
    // No-op
  }

  function refreshChipsUI() {
    const chipsEl = sidebar?.querySelector('.noodle-ai-context-chips');
    if (chipsEl) {
      chipsEl.outerHTML = buildContextChipsHTML();
      attachContextChipListeners();
    }
  }

  function attachContextChipListeners() {
    if (!sidebar) return;
    sidebar.querySelectorAll('.noodle-ai-chip-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folderId = btn.dataset.folderId;
        if (folderId === 'all') {
          aiSelectedFolderIds = [];
        } else {
          aiSelectedFolderIds = aiSelectedFolderIds.filter(id => id !== folderId);
        }
        refreshChipsUI();
      });
    });
  }

  function closeContextMenu() {
    const existing = document.getElementById('noodle-context-menu-float');
    if (existing) existing.remove();
    sidebar?.querySelector('.noodle-ai-context-add-btn')?.classList.remove('active');
  }

  function openContextMenu(addBtn) {
    closeContextMenu();

    // Append directly to noodleRoot — completely outside any overflow:hidden ancestor
    const menuEl = document.createElement('div');
    menuEl.id = 'noodle-context-menu-float';
    menuEl.className = 'noodle-ai-context-menu';
    menuEl.innerHTML = buildContextMenuInnerHTML();
    noodleRoot.appendChild(menuEl);

    // Position fixed, above the + button
    const rect = addBtn.getBoundingClientRect();
    menuEl.style.position = 'fixed';
    menuEl.style.left = rect.left + 'px';
    menuEl.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    menuEl.style.top = 'auto';

    addBtn.classList.add('active');
    attachContextMenuCheckboxes(menuEl);

    // Click outside to close
    setTimeout(() => {
      document.addEventListener('click', function onOutside(e) {
        if (!menuEl.contains(e.target) && !addBtn.contains(e.target)) {
          closeContextMenu();
          document.removeEventListener('click', onOutside);
        }
      });
    }, 0);
  }

  function attachContextMenuCheckboxes(menuEl) {
    menuEl.querySelectorAll('.noodle-ai-folder-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const folderId = cb.dataset.folderId;
        if (folderId === 'all') {
          aiSelectedFolderIds = cb.checked ? ['all'] : [];
        } else {
          aiSelectedFolderIds = aiSelectedFolderIds.filter(id => id !== 'all');
          if (cb.checked) {
            if (!aiSelectedFolderIds.includes(folderId)) aiSelectedFolderIds.push(folderId);
          } else {
            aiSelectedFolderIds = aiSelectedFolderIds.filter(x => x !== folderId);
          }
        }
        // Update chips in the sidebar input box
        refreshChipsUI();
        // Re-render menu contents to update checked/selected states
        menuEl.innerHTML = buildContextMenuInnerHTML();
        attachContextMenuCheckboxes(menuEl);
      });
    });
  }

  function attachContextListeners() {
    if (!sidebar) return;

    const addBtn = sidebar.querySelector('.noodle-ai-context-add-btn');
    if (!addBtn) return;

    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const existing = document.getElementById('noodle-context-menu-float');
      if (existing) {
        closeContextMenu();
      } else {
        openContextMenu(addBtn);
      }
    });

    attachContextChipListeners();
  }

  function attachHistoryListeners() {
    if (!sidebar) return;

    // Close history panel button (X inside the panel header)
    sidebar.querySelector('.noodle-ai-history-close-btn')?.addEventListener('click', () => {
      aiHistoryOpen = false;
      const historyEl = sidebar.querySelector('.noodle-ai-history');
      if (historyEl) historyEl.classList.remove('open');
    });

    sidebar.querySelectorAll('.noodle-ai-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('noodle-ai-history-delete')) return;
        aiCurrentChatId = item.dataset.chatId;
        aiHistoryOpen = false;
        renderChatPanel();
      });
    });

    sidebar.querySelectorAll('.noodle-ai-history-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chatId = btn.dataset.chatId;
        aiChatHistory = aiChatHistory.filter(c => c.id !== chatId);
        saveChatHistory();
        if (aiCurrentChatId === chatId) {
          aiCurrentChatId = null;
        }
        renderChatPanel();
      });
    });
  }

  function handleAiSubmit(inputEl) {
    if (!inputEl || aiIsStreaming) return;

    const text = inputEl.value.trim();
    if (!text) return;

    const command = parseAiCommand(text);

    if (!aiCurrentChatId) {
      const newChat = {
        id: Date.now().toString(),
        title: text.substring(0, 60),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: []
      };
      aiChatHistory.unshift(newChat);
      aiCurrentChatId = newChat.id;

      if (aiChatHistory.length > 50) {
        aiChatHistory = aiChatHistory.slice(0, 50);
      }
    }

    const chat = aiChatHistory.find(c => c.id === aiCurrentChatId);
    if (!chat) return;

    chat.messages.push({
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      command: command?.name || null
    });
    chat.updatedAt = new Date().toISOString();
    saveChatHistory();

    renderChatPanel();

    sendAiRequest(chat, command);
  }

  function parseAiCommand(text) {
    const match = text.match(/^\/(\w+)\s*(.*)/);
    if (!match) return null;

    const cmdName = '/' + match[1];
    const arg = match[2].trim();

    const command = AI_COMMANDS.find(c => c.name === cmdName);
    if (!command) return null;

    return { name: cmdName, arg };
  }

  function buildSystemPrompt(command) {
    let basePrompt = `You are Noodle AI, a helpful assistant that analyzes text snippets saved by the user from web pages. You help users understand, summarize, and find patterns in their saved research.

When referencing snippets, place ONLY the bare citation marker [1], [2], [3] etc. at the end of the relevant sentence — never inline mid-sentence and never surrounded by or mixed with the snippet's own text. The marker alone is the citation; do not quote or paraphrase the snippet inline. You can group multiple citations like [1][2]. These render as clickable superscript footnotes with a Sources section at the bottom.

Keep responses concise and well-structured. Use markdown-style formatting: **bold** for emphasis, bullet lists with - prefix, numbered lists with 1. prefix. Write flowing prose — never paste, quote, or repeat snippet text inline.`;

    if (command) {
      const commandPrompts = {
        '/summarize': 'Provide a clear, structured summary of the provided snippets. Group related ideas and highlight key themes.',
        '/analyze': 'Provide a deep analysis of the specified snippet or topic. Consider implications, context, and significance.',
        '/compare': 'Compare and contrast the provided snippets. Identify similarities, differences, and complementary ideas.',
        '/patterns': 'Identify recurring themes, patterns, and motifs across the provided snippets.',
        '/tags': 'Suggest descriptive tags for each snippet. Provide 2-4 tags per snippet.',
        '/questions': 'Generate thoughtful research questions inspired by the provided snippets.',
        '/export': 'Format the analysis of these snippets as clean markdown suitable for export. Include headers, key points, and organized sections.',
        '/outline': 'Create a structured outline or hierarchy from the provided snippets. Group related content under appropriate headings.',
        '/gaps': 'Analyze the provided snippets and identify potential gaps in the research. What topics are missing or underexplored?',
        '/connect': 'Find non-obvious connections between the provided snippets. Look for shared concepts, complementary ideas, or hidden relationships.',
        '/actionable': 'Transform the insights from these snippets into concrete action items. Be specific and practical.',
        '/cite': 'Format each snippet as a proper citation, including the source URL and relevant context.'
      };

      basePrompt += '\n\n' + (commandPrompts[command.name] || '');
    }

    return basePrompt;
  }

  // Build a mapping from citation numbers to snippet IDs for the current context
  let aiCitationMap = []; // [{id, index}] — index is 1-based

  function buildContextMessages(chat, command) {
    const selectedIds = getSelectedSnippetIds();
    const selectedSnippets = snippets.filter(s =>
      selectedIds.includes(s.id)
    );

    // Build citation map: [1] = first snippet, [2] = second, etc.
    aiCitationMap = selectedSnippets.map((s, i) => ({ id: s.id, index: i + 1 }));

    let contextBlock = '';
    if (selectedSnippets.length > 0) {
      contextBlock = 'Here are my saved snippets for context:\n\n';
      selectedSnippets.forEach((s, i) => {
        const truncated = s.text.length > 200
          ? s.text.substring(0, 200) + '...'
          : s.text;
        const folder = folders.find(f => f.id === s.folderId);
        contextBlock += `[${i + 1}] (${colorLabels[s.color]}${folder ? ', folder: ' + folder.name : ''}):\n"${truncated}"\nSource: ${s.url}\n\n`;
      });
    }

    const apiMessages = [];

    chat.messages.forEach((msg, index) => {
      if (msg.role === 'user') {
        let content = msg.content;
        if (index === 0 && contextBlock) {
          content = contextBlock + '\n---\n\nUser question: ' + content;
        }
        apiMessages.push({ role: 'user', content });
      } else {
        apiMessages.push({ role: 'assistant', content: msg.content });
      }
    });

    return apiMessages;
  }

  function sendAiRequest(chat, command) {
    aiIsStreaming = true;
    aiStreamBuffer = '';
    aiCurrentRequestId = Date.now().toString();

    const systemPrompt = buildSystemPrompt(command);
    const messages = buildContextMessages(chat, command);

    const messagesEl = sidebar?.querySelector('.noodle-ai-messages');
    if (messagesEl) {
      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="noodle-ai-typing" id="noodle-typing-indicator">
          <span class="noodle-ai-typing-dot"></span>
          <span class="noodle-ai-typing-dot"></span>
          <span class="noodle-ai-typing-dot"></span>
        </div>
      `);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    const sendBtn = sidebar?.querySelector('.noodle-ai-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    chrome.runtime.sendMessage({
      type: 'noodleAiRequest',
      requestId: aiCurrentRequestId,
      systemPrompt,
      messages
    });
  }

  function handleStreamStart(requestId) {
    if (requestId !== aiCurrentRequestId) return;

    const indicator = document.getElementById('noodle-typing-indicator');
    if (indicator) indicator.remove();

    const messagesEl = sidebar?.querySelector('.noodle-ai-messages');
    if (messagesEl) {
      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="noodle-ai-message assistant" id="noodle-streaming-message"></div>
      `);
    }
  }

  function handleStreamDelta(requestId, text) {
    if (requestId !== aiCurrentRequestId) return;

    aiStreamBuffer += text;

    const streamingMsg = document.getElementById('noodle-streaming-message');
    if (streamingMsg) {
      streamingMsg.innerHTML = renderAiContent(aiStreamBuffer);

      const messagesEl = sidebar?.querySelector('.noodle-ai-messages');
      if (messagesEl) {
        const isNearBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 100;
        if (isNearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
  }

  function handleStreamEnd(requestId) {
    if (requestId !== aiCurrentRequestId) return;

    const chat = aiChatHistory.find(c => c.id === aiCurrentChatId);
    if (chat) {
      chat.messages.push({
        role: 'assistant',
        content: aiStreamBuffer,
        timestamp: new Date().toISOString(),
        command: null
      });
      chat.updatedAt = new Date().toISOString();
      saveChatHistory();
    }

    const streamingMsg = document.getElementById('noodle-streaming-message');
    if (streamingMsg) streamingMsg.removeAttribute('id');

    // Attach citation click handlers
    attachCitationListeners();

    aiIsStreaming = false;
    aiStreamBuffer = '';
    aiCurrentRequestId = null;

    const sendBtn = sidebar?.querySelector('.noodle-ai-send-btn');
    if (sendBtn) sendBtn.disabled = false;

    const input = sidebar?.querySelector('.noodle-ai-input');
    if (input) input.focus();
  }

  function handleStreamError(requestId, error) {
    if (requestId !== aiCurrentRequestId) return;

    const indicator = document.getElementById('noodle-typing-indicator');
    if (indicator) indicator.remove();

    const messagesEl = sidebar?.querySelector('.noodle-ai-messages');
    if (messagesEl) {
      messagesEl.insertAdjacentHTML('beforeend', `
        <div class="noodle-ai-message assistant" style="color:#e74c3c;">
          Error: ${escapeHtml(error)}
        </div>
      `);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    aiIsStreaming = false;
    aiStreamBuffer = '';
    aiCurrentRequestId = null;

    const sendBtn = sidebar?.querySelector('.noodle-ai-send-btn');
    if (sendBtn) sendBtn.disabled = false;
  }

  function saveChatHistory() {
    chrome.storage.local.set({
      noodleChatHistory: aiChatHistory,
      noodleActiveChatId: aiCurrentChatId
    });
  }

  function handleAiInputChange(inputEl) {
    const text = inputEl.value;
    const commandsEl = sidebar?.querySelector('.noodle-ai-commands');
    if (!commandsEl) return;

    if (text.startsWith('/')) {
      const partial = text.toLowerCase();
      const matching = AI_COMMANDS.filter(cmd => cmd.name.startsWith(partial));

      if (matching.length > 0 && text !== matching[0].name) {
        commandsEl.style.display = '';
        commandsEl.innerHTML = `
          <div class="noodle-ai-commands-title">Commands</div>
          ${matching.map(cmd => `
            <div class="noodle-ai-command-item" data-command="${cmd.name}">
              <span class="noodle-ai-command-name">${cmd.name}</span>
              <span class="noodle-ai-command-desc">${cmd.desc}</span>
            </div>
          `).join('')}
        `;
        commandsEl.querySelectorAll('.noodle-ai-command-item').forEach(item => {
          item.addEventListener('click', () => {
            inputEl.value = item.dataset.command + ' ';
            inputEl.focus();
          });
        });
      } else {
        commandsEl.style.display = 'none';
      }
    } else {
      commandsEl.style.display = text.length === 0 ? '' : 'none';
    }
  }

  // Start the extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
