const STORAGE_KEY = 'enabled';

function applyBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  }
}

function broadcastToTabs(action) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null || tab.discarded) continue;
      chrome.tabs.sendMessage(tab.id, { action }).catch(() => {});
    }
  });
}

function syncBadgeFromStorage() {
  chrome.storage.local.get({ [STORAGE_KEY]: true }, (data) => {
    applyBadge(data[STORAGE_KEY]);
  });
}

syncBadgeFromStorage();
chrome.runtime.onInstalled.addListener(syncBadgeFromStorage);
chrome.runtime.onStartup.addListener(syncBadgeFromStorage);

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get({ [STORAGE_KEY]: true }, (data) => {
    const next = !data[STORAGE_KEY];
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      applyBadge(next);
      broadcastToTabs(next ? 'show' : 'hide');
    });
  });
});
