(() => {
  const STATE = {
    enabled: true,
    number: null,
    scheduled: false
  };

  const LINK_SELECTOR = 'link[data-edge-tab-counter="true"]';

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

  function createIconDataUrl(number) {
    const numberText = escapeSvgText(number);
    const fontSize = String(number).length > 2 ? 38 : String(number).length === 2 ? 46 : 58;
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
      '<rect width="64" height="64" rx="12" fill="#0f766e"/>',
      '<text x="32" y="34" text-anchor="middle" dominant-baseline="middle"',
      ` font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#ffffff">`,
      numberText,
      "</text>",
      "</svg>"
    ].join("");

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

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

  function applyNumber() {
    STATE.scheduled = false;

    if (!STATE.enabled || !STATE.number) {
      removeCounterIcon();
      return;
    }

    const link = getOrCreateCounterIconLink();
    if (!link) {
      scheduleApply();
      return;
    }

    const nextHref = createIconDataUrl(STATE.number);
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

  function setNumber(number, enabled) {
    STATE.number = Number(number);
    STATE.enabled = Boolean(enabled);
    scheduleApply();
  }

  function askForCurrentNumber() {
    chrome.runtime.sendMessage({ type: "EDGE_TAB_COUNTER_GET_NUMBER" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) {
        return;
      }

      setNumber(response.number, response.enabled);
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "EDGE_TAB_COUNTER_SET_NUMBER") {
      return;
    }

    setNumber(message.number, message.enabled);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  }

  const observerRoot = document.documentElement || document;
  const observer = new MutationObserver(() => {
    if (STATE.enabled && STATE.number && !document.head?.querySelector(LINK_SELECTOR)) {
      scheduleApply();
    }
  });

  observer.observe(observerRoot, {
    childList: true,
    subtree: true
  });

  askForCurrentNumber();
})();
