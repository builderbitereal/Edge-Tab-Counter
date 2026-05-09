const DEFAULT_SETTINGS = Object.freeze({
  badgeColor: "#0f766e"
});

const DEFAULT_ACTION_ICON = Object.freeze({
  16: "assets/icons/icon-16.png",
  32: "assets/icons/icon-32.png",
  48: "assets/icons/icon-48.png",
  128: "assets/icons/icon-128.png"
});

const pendingWindowUpdates = new Map();
const actionIconCache = new Map();
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
        files: ["src/content/tab-number-title.js"]
      },
      () => resolve(!getRuntimeError())
    );
  });
}

function normalizeSettings(stored = {}) {
  const badgeColor = /^#[0-9a-f]{6}$/i.test(stored.badgeColor)
    ? stored.badgeColor
    : DEFAULT_SETTINGS.badgeColor;

  return {
    badgeColor
  };
}

async function getSettings() {
  if (settingsCache) {
    return settingsCache;
  }

  settingsCache = normalizeSettings(await storageGet(DEFAULT_SETTINGS));
  return settingsCache;
}

async function saveSettings(nextSettings) {
  settingsCache = normalizeSettings({
    ...(await getSettings()),
    ...nextSettings
  });

  await storageSet(settingsCache);
  await refreshAllWindows();
  return settingsCache;
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

function safeSetActionIcon(tabId, icon) {
  chrome.action.setIcon({ tabId, ...icon }, () => {
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

async function sendNumberToTabTitle(tab, number) {
  if (typeof tab.id !== "number") {
    return;
  }

  const payload = {
    type: "EDGE_TAB_COUNTER_SET_TITLE_NUMBER",
    number
  };

  const delivered = await sendTabMessage(tab.id, payload);
  if (delivered) {
    return;
  }

  const injected = await executeContentScript(tab.id);
  if (injected) {
    await sendTabMessage(tab.id, payload);
  }
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function createNumberedActionImageData(number, badgeColor, size) {
  if (typeof OffscreenCanvas !== "function") {
    return null;
  }

  const numberText = String(number);
  const color = /^#[0-9a-f]{6}$/i.test(badgeColor) ? badgeColor : DEFAULT_SETTINGS.badgeColor;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  context.clearRect(0, 0, size, size);
  drawRoundedRect(context, 0, 0, size, size, Math.max(4, size * 0.22));
  context.fillStyle = color;
  context.fill();

  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(1.5, size * 0.07);
  drawRoundedRect(
    context,
    context.lineWidth / 2,
    context.lineWidth / 2,
    size - context.lineWidth,
    size - context.lineWidth,
    Math.max(4, size * 0.2)
  );
  context.stroke();

  const fontSize = Math.floor(size * (numberText.length > 2 ? 0.43 : numberText.length === 2 ? 0.52 : 0.66));
  context.fillStyle = "#ffffff";
  context.font = `900 ${fontSize}px Arial, Helvetica, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(numberText, size / 2, size / 2 + size * 0.04, size * 0.86);

  return context.getImageData(0, 0, size, size);
}

function createNumberedActionIcon(number, badgeColor) {
  const cacheKey = `${number}|${badgeColor}`;
  if (actionIconCache.has(cacheKey)) {
    return actionIconCache.get(cacheKey);
  }

  const imageData = {};

  [16, 32, 48, 128].forEach((size) => {
    const icon = createNumberedActionImageData(number, badgeColor, size);
    if (icon) {
      imageData[size] = icon;
    }
  });

  const icon = Object.keys(imageData).length ? { imageData } : { path: DEFAULT_ACTION_ICON };
  actionIconCache.set(cacheKey, icon);

  if (actionIconCache.size > 300) {
    const firstKey = actionIconCache.keys().next().value;
    actionIconCache.delete(firstKey);
  }

  return icon;
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
    safeSetActionIcon(tab.id, createNumberedActionIcon(number, settings.badgeColor));
    safeSetBadge(tab.id, String(number));
    safeSetTitle(tab.id, `Edge Tab Counter: tab ${number} of ${tabs.length}`);
    sendNumberToTabTitle(tab, number);
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
      url: tab.url || tab.pendingUrl || ""
    }))
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = normalizeSettings(await storageGet(DEFAULT_SETTINGS));
  await storageSet(settings);
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
  if (changeInfo.status || changeInfo.title) {
    scheduleWindowUpdate(tab.windowId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "EDGE_TAB_COUNTER_GET_TITLE_NUMBER") {
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
        number: index + 1
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
