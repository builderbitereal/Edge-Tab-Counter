const DEFAULT_SETTINGS = Object.freeze({
  showFaviconNumbers: true,
  showToolbarBadge: true,
  badgeColor: "#0f766e"
});

const RESTRICTED_PROTOCOLS = new Set([
  "edge:",
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "about:",
  "view-source:"
]);

const pendingWindowUpdates = new Map();
let settingsCache = null;

function getRuntimeError() {
  return chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.sync.set(value, resolve));
}

function tabsQuery(queryInfo) {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function windowsGetAll(getInfo) {
  return new Promise((resolve) => chrome.windows.getAll(getInfo, resolve));
}

async function getSettings() {
  if (settingsCache) {
    return settingsCache;
  }

  const stored = await storageGet(DEFAULT_SETTINGS);
  settingsCache = {
    ...DEFAULT_SETTINGS,
    ...stored
  };

  return settingsCache;
}

async function saveSettings(nextSettings) {
  settingsCache = {
    ...(await getSettings()),
    ...nextSettings
  };

  await storageSet(settingsCache);
  await refreshAllWindows();
  return settingsCache;
}

function isInjectableUrl(rawUrl = "") {
  try {
    const url = new URL(rawUrl);
    return !RESTRICTED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function safeSetBadge(tabId, text) {
  chrome.action.setBadgeText({ tabId, text }, () => {
    getRuntimeError();
  });
}

function safeSetTitle(tabId, title) {
  chrome.action.setTitle({ tabId, title }, () => {
    getRuntimeError();
  });
}

function sendNumberToTab(tab, number, enabled) {
  const url = tab.url || tab.pendingUrl || "";

  if (typeof tab.id !== "number" || !isInjectableUrl(url)) {
    return;
  }

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "EDGE_TAB_COUNTER_SET_NUMBER",
      number,
      enabled
    },
    () => {
      getRuntimeError();
    }
  );
}

async function updateWindow(windowId) {
  if (typeof windowId !== "number" || windowId < 0) {
    return;
  }

  const settings = await getSettings();
  chrome.action.setBadgeBackgroundColor({ color: settings.badgeColor }, () => {
    getRuntimeError();
  });

  const tabs = await tabsQuery({ windowId });
  tabs.sort((left, right) => left.index - right.index);

  tabs.forEach((tab, tabIndex) => {
    if (typeof tab.id !== "number") {
      return;
    }

    const number = tabIndex + 1;
    const text = settings.showToolbarBadge ? String(number) : "";

    safeSetBadge(tab.id, text);
    safeSetTitle(tab.id, `Edge Tab Counter: tab ${number} of ${tabs.length}`);
    sendNumberToTab(tab, number, settings.showFaviconNumbers);
  });
}

function scheduleWindowUpdate(windowId) {
  if (typeof windowId !== "number" || windowId < 0) {
    return;
  }

  if (pendingWindowUpdates.has(windowId)) {
    clearTimeout(pendingWindowUpdates.get(windowId));
  }

  const timeoutId = setTimeout(() => {
    pendingWindowUpdates.delete(windowId);
    updateWindow(windowId);
  }, 25);

  pendingWindowUpdates.set(windowId, timeoutId);
}

async function refreshAllWindows() {
  const windows = await windowsGetAll({ populate: false });
  windows.forEach((edgeWindow) => scheduleWindowUpdate(edgeWindow.id));
}

async function getPopupState() {
  const [tabs, settings] = await Promise.all([
    tabsQuery({ currentWindow: true }),
    getSettings()
  ]);

  tabs.sort((left, right) => left.index - right.index);

  return {
    settings,
    tabs: tabs.map((tab, tabIndex) => ({
      id: tab.id,
      active: Boolean(tab.active),
      number: tabIndex + 1,
      title: tab.title || "Untitled tab",
      url: tab.url || tab.pendingUrl || "",
      injectable: isInjectableUrl(tab.url || tab.pendingUrl || "")
    }))
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await storageGet(DEFAULT_SETTINGS);
  await storageSet({
    ...DEFAULT_SETTINGS,
    ...stored
  });
  await refreshAllWindows();
});

chrome.runtime.onStartup.addListener(refreshAllWindows);

chrome.tabs.onCreated.addListener((tab) => scheduleWindowUpdate(tab.windowId));
chrome.tabs.onActivated.addListener(({ windowId }) => scheduleWindowUpdate(windowId));
chrome.tabs.onMoved.addListener((tabId, moveInfo) => scheduleWindowUpdate(moveInfo.windowId));
chrome.tabs.onAttached.addListener((tabId, attachInfo) => scheduleWindowUpdate(attachInfo.newWindowId));
chrome.tabs.onDetached.addListener((tabId, detachInfo) => scheduleWindowUpdate(detachInfo.oldWindowId));
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => scheduleWindowUpdate(removeInfo.windowId));
chrome.tabs.onReplaced.addListener(() => refreshAllWindows());
chrome.windows.onCreated.addListener((edgeWindow) => scheduleWindowUpdate(edgeWindow.id));
chrome.windows.onFocusChanged.addListener((windowId) => scheduleWindowUpdate(windowId));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status || changeInfo.url || changeInfo.title || changeInfo.favIconUrl) {
    scheduleWindowUpdate(tab.windowId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "EDGE_TAB_COUNTER_GET_NUMBER") {
    (async () => {
      const tab = sender.tab;
      if (!tab || typeof tab.windowId !== "number" || typeof tab.id !== "number") {
        sendResponse({ ok: false });
        return;
      }

      const tabs = await tabsQuery({ windowId: tab.windowId });
      tabs.sort((left, right) => left.index - right.index);
      const index = tabs.findIndex((candidate) => candidate.id === tab.id);

      if (index === -1) {
        sendResponse({ ok: false });
        return;
      }

      sendResponse({
        ok: true,
        number: index + 1,
        enabled: (await getSettings()).showFaviconNumbers
      });
    })();

    return true;
  }

  if (message.type === "EDGE_TAB_COUNTER_GET_POPUP_STATE") {
    getPopupState().then(sendResponse);
    return true;
  }

  if (message.type === "EDGE_TAB_COUNTER_SET_SETTINGS") {
    saveSettings(message.settings || {}).then((settings) => {
      sendResponse({ ok: true, settings });
    });
    return true;
  }

  if (message.type === "EDGE_TAB_COUNTER_REFRESH") {
    refreshAllWindows().then(() => getPopupState()).then(sendResponse);
    return true;
  }

  return false;
});
