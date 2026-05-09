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
const iconDataCache = new Map();
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

function executeContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["src/content/tab-number-favicon.js"]
      },
      () => resolve(!getRuntimeError())
    );
  });
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

function sendTabMessage(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, () => {
      resolve(!getRuntimeError());
    });
  });
}

async function sendNumberToTab(tab, number, enabled) {
  const url = tab.url || tab.pendingUrl || "";

  if (typeof tab.id !== "number" || !isInjectableUrl(url)) {
    return;
  }

  const settings = await getSettings();
  const payload = {
    type: "EDGE_TAB_COUNTER_SET_NUMBER",
    number,
    enabled,
    badgeColor: settings.badgeColor
  };

  const delivered = await sendTabMessage(tab.id, payload);
  if (delivered || !enabled) {
    return;
  }

  const injected = await executeContentScript(tab.id);
  if (injected) {
    await sendTabMessage(tab.id, payload);
  }
}

function escapeSvgAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    };
    return replacements[character];
  });
}

function escapeSvgText(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    };
    return replacements[character];
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function normalizeIconUrl(iconUrl) {
  if (!iconUrl || typeof iconUrl !== "string") {
    return "";
  }

  if (iconUrl.startsWith("data:image/")) {
    return iconUrl;
  }

  try {
    const url = new URL(iconUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return "";
  }

  return "";
}

async function imageUrlToDataUrl(iconUrl) {
  const normalized = normalizeIconUrl(iconUrl);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("data:image/")) {
    return normalized;
  }

  const response = await fetch(normalized, {
    cache: "force-cache",
    credentials: "omit"
  });

  if (!response.ok) {
    throw new Error(`Unable to load favicon: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = await response.arrayBuffer();
  return `data:${contentType};base64,${arrayBufferToBase64(buffer)}`;
}

function createBadgedSvgDataUrl(number, baseIconDataUrl, badgeColor) {
  const numberText = escapeSvgText(number);
  const color = /^#[0-9a-f]{6}$/i.test(badgeColor) ? badgeColor : DEFAULT_SETTINGS.badgeColor;
  const fontSize = String(number).length > 2 ? 20 : String(number).length === 2 ? 23 : 28;
  const baseImage = baseIconDataUrl
    ? `<image href="${escapeSvgAttribute(baseIconDataUrl)}" x="2" y="2" width="60" height="60" preserveAspectRatio="xMidYMid meet"/>`
    : '<rect x="2" y="2" width="60" height="60" rx="12" fill="#f8fafc"/><path d="M18 20h28v24H18z" fill="#94a3b8"/>';
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    baseImage,
    '<circle cx="46" cy="46" r="18" fill="#ffffff"/>',
    `<circle cx="46" cy="46" r="15.5" fill="${color}"/>`,
    `<text x="46" y="47.5" text-anchor="middle" dominant-baseline="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff">${numberText}</text>`,
    "</svg>"
  ].join("");

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function rememberIconCache(key, value) {
  iconDataCache.set(key, value);
  if (iconDataCache.size <= 300) {
    return;
  }

  const firstKey = iconDataCache.keys().next().value;
  iconDataCache.delete(firstKey);
}

async function composeBadgedIcon({ number, iconUrl, badgeColor }) {
  const normalizedIconUrl = normalizeIconUrl(iconUrl);
  const cacheKey = JSON.stringify({
    number,
    iconUrl: normalizedIconUrl,
    badgeColor
  });

  if (iconDataCache.has(cacheKey)) {
    return iconDataCache.get(cacheKey);
  }

  let baseIconDataUrl = "";
  try {
    baseIconDataUrl = await imageUrlToDataUrl(normalizedIconUrl);
  } catch {
    baseIconDataUrl = "";
  }

  const dataUrl = createBadgedSvgDataUrl(number, baseIconDataUrl, badgeColor);
  rememberIconCache(cacheKey, dataUrl);
  return dataUrl;
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

      const settings = await getSettings();
      sendResponse({
        ok: true,
        number: index + 1,
        enabled: settings.showFaviconNumbers,
        badgeColor: settings.badgeColor
      });
    })();

    return true;
  }

  if (message.type === "EDGE_TAB_COUNTER_COMPOSE_ICON") {
    (async () => {
      const settings = await getSettings();
      const iconDataUrl = await composeBadgedIcon({
        number: message.number,
        iconUrl: message.iconUrl,
        badgeColor: message.badgeColor || settings.badgeColor
      });

      sendResponse({
        ok: true,
        iconDataUrl
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
