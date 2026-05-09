(() => {
  if (window.__EDGE_TAB_COUNTER_CONTENT_READY__) {
    chrome.runtime.sendMessage({ type: "EDGE_TAB_COUNTER_GET_NUMBER" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        return;
      }

      window.postMessage(
        {
          source: "EDGE_TAB_COUNTER",
          type: "EDGE_TAB_COUNTER_SET_NUMBER",
          number: response.number,
          enabled: response.enabled,
          badgeColor: response.badgeColor
        },
        "*"
      );
    });
    return;
  }

  window.__EDGE_TAB_COUNTER_CONTENT_READY__ = true;

  const STATE = {
    badgeColor: "#0f766e",
    enabled: true,
    iconDataUrl: "",
    lastComposeKey: "",
    number: null,
    scheduled: false
  };

  const LINK_SELECTOR = 'link[data-edge-tab-counter="true"]';
  const ICON_REL_PATTERN = /\b(?:shortcut\s+icon|icon|apple-touch-icon|mask-icon)\b/i;

  function getOrCreateCounterIconLink() {
    if (!document.head) {
      return null;
    }

    let link = document.head.querySelector(LINK_SELECTOR);
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      link.setAttribute("type", "image/svg+xml");
      link.setAttribute("data-edge-tab-counter", "true");
      document.head.appendChild(link);
    } else if (link.parentNode === document.head && document.head.lastElementChild !== link) {
      document.head.appendChild(link);
    }

    return link;
  }

  function removeCounterIcon() {
    document.querySelectorAll(LINK_SELECTOR).forEach((link) => link.remove());
  }

  function toAbsoluteUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") {
      return "";
    }

    if (rawUrl.startsWith("data:image/")) {
      return rawUrl;
    }

    try {
      return new URL(rawUrl, document.baseURI || window.location.href).href;
    } catch {
      return "";
    }
  }

  function findOriginalFaviconUrl() {
    const iconLinks = Array.from(document.querySelectorAll("link[rel]"))
      .filter((link) => link.dataset.edgeTabCounter !== "true")
      .filter((link) => ICON_REL_PATTERN.test(link.getAttribute("rel") || ""))
      .map((link) => toAbsoluteUrl(link.getAttribute("href")))
      .filter(Boolean);

    return iconLinks[0] || toAbsoluteUrl("/favicon.ico");
  }

  async function composeIcon() {
    if (!STATE.enabled || !STATE.number) {
      STATE.iconDataUrl = "";
      STATE.lastComposeKey = "";
      removeCounterIcon();
      return;
    }

    const iconUrl = findOriginalFaviconUrl();
    const composeKey = `${STATE.number}|${STATE.badgeColor}|${iconUrl}`;
    if (STATE.lastComposeKey === composeKey && STATE.iconDataUrl) {
      scheduleApply();
      return;
    }

    STATE.lastComposeKey = composeKey;
    chrome.runtime.sendMessage(
      {
        type: "EDGE_TAB_COUNTER_COMPOSE_ICON",
        number: STATE.number,
        iconUrl,
        badgeColor: STATE.badgeColor
      },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          return;
        }

        STATE.iconDataUrl = response.iconDataUrl;
        scheduleApply();
      }
    );
  }

  function applyNumber() {
    STATE.scheduled = false;

    if (!STATE.enabled || !STATE.number || !STATE.iconDataUrl) {
      removeCounterIcon();
      return;
    }

    const link = getOrCreateCounterIconLink();
    if (!link) {
      scheduleApply();
      return;
    }

    const nextHref = STATE.iconDataUrl;
    if (link.href !== nextHref) {
      link.href = nextHref;
    }
  }

  function scheduleApply() {
    if (STATE.scheduled) {
      return;
    }

    STATE.scheduled = true;
    requestAnimationFrame(applyNumber);
  }

  function setNumber(number, enabled, badgeColor = STATE.badgeColor) {
    STATE.number = Number(number);
    STATE.enabled = Boolean(enabled);
    STATE.badgeColor = badgeColor || "#0f766e";
    composeIcon();
  }

  function askForCurrentNumber() {
    chrome.runtime.sendMessage({ type: "EDGE_TAB_COUNTER_GET_NUMBER" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        return;
      }

      setNumber(response.number, response.enabled, response.badgeColor);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "EDGE_TAB_COUNTER") {
      return;
    }

    if (event.data.type === "EDGE_TAB_COUNTER_SET_NUMBER") {
      setNumber(event.data.number, event.data.enabled, event.data.badgeColor);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "EDGE_TAB_COUNTER_SET_NUMBER") {
      return;
    }

    setNumber(message.number, message.enabled, message.badgeColor);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  }

  const headObserver = new MutationObserver(() => {
    if (STATE.enabled && STATE.number) {
      composeIcon();
    }
  });

  function observeHead() {
    if (!document.head) {
      const documentObserver = new MutationObserver(() => {
        if (document.head) {
          documentObserver.disconnect();
          observeHead();
          scheduleApply();
        }
      });

      documentObserver.observe(document.documentElement || document, {
        childList: true,
        subtree: true
      });
      return;
    }

    headObserver.observe(document.head, {
      attributes: true,
      attributeFilter: ["href", "rel"],
      childList: true,
      subtree: true
    });
  }

  observeHead();
  askForCurrentNumber();
})();
