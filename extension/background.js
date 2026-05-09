const STORAGE_KEY = 'enabled';

function applyBadge(enabled) {
  if (enabled) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff4444' });
  }
}

function sendToActiveTab(action) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id != null) {
      chrome.tabs.sendMessage(tab.id, { action }).catch(() => {});
    }
  });
}

chrome.storage.local.get({ [STORAGE_KEY]: true }, (data) => {
  applyBadge(data[STORAGE_KEY]);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ [STORAGE_KEY]: true }, (data) => {
    applyBadge(data[STORAGE_KEY]);
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get({ [STORAGE_KEY]: true }, (data) => {
    applyBadge(data[STORAGE_KEY]);
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.storage.local.get({ [STORAGE_KEY]: true }, (data) => {
    const next = !data[STORAGE_KEY];
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      applyBadge(next);
      sendToActiveTab(next ? 'show' : 'hide');
    });
  });
});
