// Noodle - Background Service Worker

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
});

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

    // Check if all-sites mode is enabled
    chrome.storage.local.get(['noodleAllSites'], (result) => {
      if (result.noodleAllSites) {
        // Check if we have permission
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
  }
});
