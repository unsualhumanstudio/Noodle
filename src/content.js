// Noodle - Content Script
(function() {
  'use strict';

  // Default color labels (user can customize)
  const DEFAULT_COLOR_LABELS = {
    blue: 'Ideas',
    green: 'Copy',
    coral: 'Questions'
  };

  const COLORS = {
    blue: '#D2DBF2',
    green: '#D2F2ED',
    coral: '#FED7CE'
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

  // Initialize
  function init() {
    loadData(() => {
      // After data is loaded, check if we need to highlight something
      checkForHighlightRequest();
    });
    createSidebar();
    createToggle();
    setupSelectionListener();
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
        // Scroll to the text
        const rect = range.getBoundingClientRect();
        const absoluteTop = rect.top + window.scrollY;
        window.scrollTo({
          top: absoluteTop - (window.innerHeight / 3),
          behavior: 'smooth'
        });

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
    chrome.storage.local.get(['claudeHighlights', 'claudeFolders', 'claudeColorLabels', 'noodleTogglePosition'], (result) => {
      snippets = result.claudeHighlights || [];
      folders = result.claudeFolders || [];
      colorLabels = result.claudeColorLabels || { ...DEFAULT_COLOR_LABELS };
      togglePosition = result.noodleTogglePosition || null;
      updateBadge();
      updateTogglePosition();
      renderSidebar();
      if (callback) callback();
    });
  }

  // Save toggle position
  function saveTogglePosition() {
    chrome.storage.local.set({ noodleTogglePosition: togglePosition });
  }

  // Update toggle button position
  function updateTogglePosition() {
    if (!toggle) return;
    if (togglePosition) {
      toggle.style.right = 'auto';
      toggle.style.bottom = 'auto';
      toggle.style.left = `${togglePosition.x}px`;
      toggle.style.top = `${togglePosition.y}px`;
    } else {
      toggle.style.left = '';
      toggle.style.top = '';
      toggle.style.right = '16px';
      toggle.style.bottom = '16px';
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
    document.body.appendChild(sidebar);
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

  // Create the toggle button
  function createToggle() {
    toggle = document.createElement('button');
    toggle.className = 'claude-highlighter-toggle';
    toggle.innerHTML = '<span class="badge" style="display: none;">0</span>';
    document.body.appendChild(toggle);

    // Drag state
    let isDragging = false;
    let hasMoved = false;
    let dragStartX, dragStartY;
    let toggleStartX, toggleStartY;

    toggle.addEventListener('mousedown', (e) => {
      isDragging = true;
      hasMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = toggle.getBoundingClientRect();
      toggleStartX = rect.left;
      toggleStartY = rect.top;

      toggle.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;

      // Only count as moved if dragged more than 5px
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
      }

      let newX = toggleStartX + deltaX;
      let newY = toggleStartY + deltaY;

      // Keep within viewport
      const toggleSize = 44;
      newX = Math.max(0, Math.min(newX, window.innerWidth - toggleSize));
      newY = Math.max(0, Math.min(newY, window.innerHeight - toggleSize));

      toggle.style.right = 'auto';
      toggle.style.bottom = 'auto';
      toggle.style.left = `${newX}px`;
      toggle.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      toggle.style.cursor = '';

      if (hasMoved) {
        // Save new position
        const rect = toggle.getBoundingClientRect();
        togglePosition = { x: rect.left, y: rect.top };
        saveTogglePosition();
      }
    });

    toggle.addEventListener('click', (e) => {
      // Only toggle sidebar if we didn't drag
      if (!hasMoved) {
        sidebar.classList.toggle('open');
      }
    });

    // Tooltip for toggle
    toggle.addEventListener('mouseenter', () => {
      if (!isDragging) showTooltip(toggle, 'Click to open Noodles (drag to move)');
    });
    toggle.addEventListener('mouseleave', hideTooltip);
  }

  // Update badge count
  function updateBadge() {
    const badge = toggle?.querySelector('.badge');
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
    // Check current all-sites permission status
    let hasAllSites = false;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'checkAllSitesPermission' });
      hasAllSites = response?.hasPermission || false;
    } catch (e) {
      // Extension context may not be available
    }

    const dialog = document.createElement('div');
    dialog.className = 'claude-highlighter-dialog-overlay';
    dialog.innerHTML = `
      <div class="claude-highlighter-dialog settings-dialog">
        <h3>Settings</h3>
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
        e.target.closest('.folder-picker')) {
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
    if (element.closest('.claude-highlighter-toolbar, .claude-highlighter-sidebar, .claude-highlighter-toggle, .claude-highlighter-dialog-overlay, .folder-picker')) {
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

    // Search for the text with context
    const searchText = anchor.text;
    let searchStart = 0;
    let bestMatch = null;
    let bestScore = -1;

    while (true) {
      const index = combinedText.indexOf(searchText, searchStart);
      if (index === -1) break;

      // Score this match based on prefix/suffix context
      let score = 0;

      if (anchor.prefix) {
        const prefixInDoc = combinedText.substring(Math.max(0, index - anchor.prefix.length), index);
        if (prefixInDoc.endsWith(anchor.prefix) || anchor.prefix.endsWith(prefixInDoc)) {
          score += prefixInDoc.length;
        }
      }

      if (anchor.suffix) {
        const suffixInDoc = combinedText.substring(index + searchText.length, index + searchText.length + anchor.suffix.length);
        if (suffixInDoc.startsWith(anchor.suffix) || anchor.suffix.startsWith(suffixInDoc)) {
          score += suffixInDoc.length;
        }
      }

      if (score > bestScore || bestMatch === null) {
        bestScore = score;
        bestMatch = { index, length: searchText.length };
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

  // Start the extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
