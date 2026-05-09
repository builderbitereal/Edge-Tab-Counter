const faviconToggle = document.querySelector("#faviconToggle");
const badgeToggle = document.querySelector("#badgeToggle");
const refreshButton = document.querySelector("#refreshButton");
const tabList = document.querySelector("#tabList");
const tabTotal = document.querySelector("#tabTotal");

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

function formatUrl(url) {
  if (!url) {
    return "No URL";
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol;
  } catch {
    return url;
  }
}

function renderTabs(tabs) {
  tabTotal.textContent = `${tabs.length} ${tabs.length === 1 ? "tab" : "tabs"}`;
  tabList.replaceChildren();

  tabs.forEach((tab) => {
    const item = document.createElement("li");
    item.className = `tab-row${tab.active ? " is-active" : ""}`;

    const number = document.createElement("span");
    number.className = "tab-number";
    number.textContent = tab.number;

    const textWrap = document.createElement("span");

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title;

    const meta = document.createElement("small");
    meta.className = "tab-meta";
    meta.textContent = tab.injectable ? formatUrl(tab.url) : `${formatUrl(tab.url)} - Edge protected page`;

    textWrap.append(title, meta);
    item.append(number, textWrap);
    tabList.append(item);
  });
}

function applyState(state) {
  faviconToggle.checked = Boolean(state.settings.showFaviconNumbers);
  badgeToggle.checked = Boolean(state.settings.showToolbarBadge);
  renderTabs(state.tabs || []);
}

async function loadState() {
  const state = await sendMessage({ type: "EDGE_TAB_COUNTER_GET_POPUP_STATE" });
  applyState(state);
}

async function updateSettings(settings) {
  const response = await sendMessage({
    type: "EDGE_TAB_COUNTER_SET_SETTINGS",
    settings
  });

  if (response?.settings) {
    await loadState();
  }
}

faviconToggle.addEventListener("change", () => {
  updateSettings({ showFaviconNumbers: faviconToggle.checked });
});

badgeToggle.addEventListener("change", () => {
  updateSettings({ showToolbarBadge: badgeToggle.checked });
});

refreshButton.addEventListener("click", async () => {
  const state = await sendMessage({ type: "EDGE_TAB_COUNTER_REFRESH" });
  applyState(state);
});

loadState();
