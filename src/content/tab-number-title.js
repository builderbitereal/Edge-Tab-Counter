(() => {
  const PREFIX_PATTERN = /^\d+\s\|\s/;

  if (window.__EDGE_TAB_COUNTER_TITLE_READY__) {
    chrome.runtime.sendMessage({ type: "EDGE_TAB_COUNTER_GET_TITLE_NUMBER" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        return;
      }

      window.postMessage(
        {
          source: "EDGE_TAB_COUNTER",
          type: "EDGE_TAB_COUNTER_SET_TITLE_NUMBER",
          number: response.number
        },
        "*"
      );
    });
    return;
  }

  window.__EDGE_TAB_COUNTER_TITLE_READY__ = true;

  const STATE = {
    applying: false,
    baseTitle: "",
    number: null,
    scheduled: false
  };

  function stripCounterPrefix(title) {
    return String(title || "").replace(PREFIX_PATTERN, "");
  }

  function prefixedTitle(title) {
    if (!STATE.number) {
      return stripCounterPrefix(title);
    }

    const cleanTitle = stripCounterPrefix(title);
    return `${STATE.number} | ${cleanTitle || "Untitled tab"}`;
  }

  function applyTitleNumber() {
    STATE.scheduled = false;

    if (!STATE.number) {
      return;
    }

    const currentBaseTitle = stripCounterPrefix(document.title);
    if (!STATE.applying) {
      STATE.baseTitle = currentBaseTitle;
    }

    const nextTitle = prefixedTitle(STATE.baseTitle);
    if (document.title === nextTitle) {
      return;
    }

    STATE.applying = true;
    document.title = nextTitle;
    queueMicrotask(() => {
      STATE.applying = false;
    });
  }

  function scheduleApplyTitleNumber() {
    if (STATE.scheduled) {
      return;
    }

    STATE.scheduled = true;
    requestAnimationFrame(applyTitleNumber);
  }

  function setTitleNumber(number) {
    const nextNumber = Number(number);
    if (!Number.isFinite(nextNumber) || nextNumber < 1) {
      return;
    }

    STATE.number = nextNumber;
    STATE.baseTitle = stripCounterPrefix(document.title);
    scheduleApplyTitleNumber();
  }

  function askForCurrentNumber() {
    chrome.runtime.sendMessage({ type: "EDGE_TAB_COUNTER_GET_TITLE_NUMBER" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        return;
      }

      setTitleNumber(response.number);
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "EDGE_TAB_COUNTER") {
      return;
    }

    if (event.data.type === "EDGE_TAB_COUNTER_SET_TITLE_NUMBER") {
      setTitleNumber(event.data.number);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "EDGE_TAB_COUNTER_SET_TITLE_NUMBER") {
      return;
    }

    setTitleNumber(message.number);
  });

  const titleObserver = new MutationObserver(() => {
    if (!STATE.applying) {
      STATE.baseTitle = stripCounterPrefix(document.title);
    }

    scheduleApplyTitleNumber();
  });

  function observeTitle() {
    const titleElement = document.querySelector("title");
    if (titleElement) {
      titleObserver.observe(titleElement, {
        characterData: true,
        childList: true,
        subtree: true
      });
      return;
    }

    const documentObserver = new MutationObserver(() => {
      const nextTitleElement = document.querySelector("title");
      if (!nextTitleElement) {
        return;
      }

      documentObserver.disconnect();
      titleObserver.observe(nextTitleElement, {
        characterData: true,
        childList: true,
        subtree: true
      });
      scheduleApplyTitleNumber();
    });

    documentObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  }

  observeTitle();
  askForCurrentNumber();
})();
