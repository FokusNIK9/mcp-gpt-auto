(() => {
  "use strict";

  const ALLOWED_DIALOG_TEXT = [
    "heroism-petri-causal.ngrok-free.dev",
    "heroism_petri_causal_ngrok_free_dev__jit_plugin.queueTask",
    "Local Dev Agent"
  ];

  const CONFIRM_TEXT = new Set([
    "подтвердить",
    "confirm",
    "allow",
    "approve"
  ]);

  const CLICK_DELAY_MS = 250;
  const SCAN_INTERVAL_MS = 1000;
  const STORAGE_KEY = "localDevAgentConfirmGuardEnabled";
  const TEXT_STORAGE_KEY = "localDevAgentCustomText";
  const INTERVAL_STORAGE_KEY = "localDevAgentSendInterval";
  const TIMESTAMP_STORAGE_KEY = "localDevAgentUseTimestamp";
  const ATTACHMENTS_STORAGE_KEY = "localDevAgentAttachments";
  const TAG_STORAGE_KEY = "localDevAgentTag";
  const USE_ID_STORAGE_KEY = "localDevAgentUseId";
  const SKIP_READY_STORAGE_KEY = "localDevAgentSkipReady";

  let enabled = window.localStorage.getItem(STORAGE_KEY) !== "false";
  let customText = window.localStorage.getItem(TEXT_STORAGE_KEY) || "текст текст";
  let sendIntervalMin = parseFloat(window.localStorage.getItem(INTERVAL_STORAGE_KEY) || "1");
  let useTimestamp = window.localStorage.getItem(TIMESTAMP_STORAGE_KEY) === "true";
  let attachmentPaths = window.localStorage.getItem(ATTACHMENTS_STORAGE_KEY) || "";
  let tagText = window.localStorage.getItem(TAG_STORAGE_KEY) || "";
  let useUniqueId = window.localStorage.getItem(USE_ID_STORAGE_KEY) === "true";
  let skipReadyCheck = window.localStorage.getItem(SKIP_READY_STORAGE_KEY) === "true";

  let uiContainer = null;
  let toggleButton = null;
  let textInput = null;
  let intervalInput = null;
  let tagInput = null;
  let idToggle = null;
  let timestampToggle = null;
  let skipReadyToggle = null;
  let attachmentsInput = null;
  let progressBar = null;
  let countdownLabel = null;
  let statusLabel = null;

  let scanTimer = 0;
  let nextSendTime = 0;
  let tickTimer = 0;

  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isConfirmButton(button) {
    const text = normalize(button.innerText || button.textContent);
    return CONFIRM_TEXT.has(text);
  }

  function hasAllowedToolCall(scope) {
    const text = scope.textContent || "";
    return ALLOWED_DIALOG_TEXT.some(needle => text.includes(needle));
  }

  function findDialogScope(button) {
    let node = button;
    for (let depth = 0; node && depth < 8; depth += 1) {
      if (node.getAttribute?.("role") === "dialog") return node;
      const text = node.textContent || "";
      if (text.includes("Local Dev Agent") || text.includes("Вызов инструмента")) return node;
      node = node.parentElement;
    }
    return button.closest("main") || document.body;
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanAndClick();
    }, 300);
  }

  function scanAndClick() {
    if (!enabled) return;

    const buttons = Array.from(document.querySelectorAll("button"));

    for (const button of buttons) {
      if (!(button instanceof HTMLButtonElement)) continue;
      if (button.dataset.localDevAgentConfirmClicked === "true") continue;
      if (button.disabled || !visible(button) || !isConfirmButton(button)) continue;

      const scope = findDialogScope(button);
      if (!hasAllowedToolCall(scope)) continue;

      button.dataset.localDevAgentConfirmClicked = "true";
      window.setTimeout(() => {
        if (!button.disabled && visible(button)) {
          console.info("[Local Dev Agent Confirm Guard] Confirming allowlisted tool call.");
          button.click();
        }
      }, CLICK_DELAY_MS);
      return;
    }
  }

  function startTick() {
    if (tickTimer) window.clearInterval(tickTimer);
    tickTimer = window.setInterval(tick, 1000);
  }

  function stopTick() {
    if (tickTimer) {
      window.clearInterval(tickTimer);
      tickTimer = 0;
    }
  }

  function tick() {
    if (!enabled) {
      stopTick();
      return;
    }

    const now = Date.now();
    const remainingMs = nextSendTime - now;

    if (remainingMs <= 0) {
      const isReady = skipReadyCheck || isChatGPTReady();
      if (isReady) {
        console.info("[Local Dev Agent] Timer expired. Sending message.");
        const success = performAutomatedSend();
        if (success) {
          resetTimer();
          if (statusLabel) statusLabel.textContent = "Status: Sent OK";
        } else {
          if (statusLabel) statusLabel.textContent = "Status: Send Error (Retrying)";
        }
      } else {
        if (statusLabel) statusLabel.textContent = "Status: Waiting (Busy/No Btn)";
      }
      return;
    }

    if (statusLabel && statusLabel.textContent.startsWith("Status: Waiting")) {
       statusLabel.textContent = "Status: Idle";
    }
    updateProgressUI(remainingMs);
  }

  function resetTimer() {
    const intervalMs = Math.max(0.1, sendIntervalMin) * 60 * 1000;
    nextSendTime = Date.now() + intervalMs;
  }

  function updateProgressUI(remainingMs) {
    if (!progressBar || !countdownLabel) return;

    const totalMs = Math.max(0.1, sendIntervalMin) * 60 * 1000;
    const progress = Math.max(0, Math.min(1, remainingMs / totalMs));

    const seconds = Math.ceil(remainingMs / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    countdownLabel.textContent = `Next send in: ${m}:${s.toString().padStart(2, "0")}`;

    progressBar.style.height = `${progress * 100}%`;
    const hue = progress * 120;
    progressBar.style.background = `hsl(${hue}, 70%, 50%)`;
  }

  function generateShortId() {
    const firstChar = (tagText || "A")[0].toLowerCase();
    const randomPart = Math.random().toString(36).substring(2, 5);
    return `${firstChar}${randomPart}`;
  }

  function performAutomatedSend() {
    let prefixes = [];
    
    if (tagText.trim()) {
      prefixes.push(`[${tagText.trim()}]`);
    }

    if (useUniqueId) {
      prefixes.push(`{#${generateShortId()}}`);
    }

    if (useTimestamp) {
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      prefixes.push(`(${timeStr})`);
    }

    let finalMsg = prefixes.join(" ") + (prefixes.length ? " " : "") + customText;

    if (attachmentPaths.trim()) {
      finalMsg += `\n\nAttachments:\n${attachmentPaths}`;
    }

    return sendMessageToChat(finalMsg);
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
    updateUI();

    if (enabled) {
      resetTimer();
      startTick();
      scheduleScan();
    } else {
      stopTick();
    }
  }

  function updateUI() {
    if (!toggleButton) return;

    toggleButton.textContent = enabled ? "Agent Auto: ON" : "Agent Auto: OFF";
    toggleButton.style.background = enabled ? "#10a37f" : "#3a3a3a";
    toggleButton.style.borderColor = enabled ? "#38d9b4" : "#666";

    if (textInput) textInput.value = customText;
    if (intervalInput) intervalInput.value = sendIntervalMin;
    if (tagInput) tagInput.value = tagText;
    if (idToggle) idToggle.checked = useUniqueId;
    if (timestampToggle) timestampToggle.checked = useTimestamp;
    if (attachmentsInput) attachmentsInput.value = attachmentPaths;
    if (skipReadyToggle) skipReadyToggle.checked = skipReadyCheck;

    if (!enabled) {
      if (countdownLabel) countdownLabel.textContent = "Auto Mode: OFF";
      if (progressBar) progressBar.style.height = "0%";
      if (statusLabel) statusLabel.textContent = "Status: Disabled";
    }
  }

  function installUI() {
    if (document.getElementById("local-dev-agent-ui-container")) return;

    uiContainer = document.createElement("div");
    uiContainer.id = "local-dev-agent-ui-container";
    uiContainer.style.position = "fixed";
    uiContainer.style.right = "18px";
    uiContainer.style.bottom = "18px";
    uiContainer.style.zIndex = "2147483647";
    uiContainer.style.padding = "12px 12px 12px 24px";
    uiContainer.style.background = "#2a2a2a";
    uiContainer.style.border = "1px solid #444";
    uiContainer.style.borderRadius = "12px";
    uiContainer.style.color = "#fff";
    uiContainer.style.font = "12px system-ui, sans-serif";
    uiContainer.style.boxShadow = "0 8px 32px rgba(0,0,0,.4)";
    uiContainer.style.display = "flex";
    uiContainer.style.flexDirection = "column";
    uiContainer.style.gap = "6px";
    uiContainer.style.minWidth = "220px";

    const barContainer = document.createElement("div");
    barContainer.style.position = "absolute";
    barContainer.style.left = "8px";
    barContainer.style.top = "12px";
    barContainer.style.bottom = "12px";
    barContainer.style.width = "6px";
    barContainer.style.background = "#1a1a1a";
    barContainer.style.borderRadius = "3px";
    barContainer.style.overflow = "hidden";
    barContainer.style.display = "flex";
    barContainer.style.flexDirection = "column-reverse";
    uiContainer.appendChild(barContainer);

    progressBar = document.createElement("div");
    progressBar.style.width = "100%";
    progressBar.style.height = "100%";
    progressBar.style.transition = "height 1s linear, background 1s linear";
    barContainer.appendChild(progressBar);

    countdownLabel = document.createElement("div");
    countdownLabel.style.fontWeight = "bold";
    countdownLabel.style.textAlign = "center";
    countdownLabel.style.color = "#38d9b4";
    uiContainer.appendChild(countdownLabel);

    statusLabel = document.createElement("div");
    statusLabel.style.fontSize = "10px";
    statusLabel.style.textAlign = "center";
    statusLabel.style.color = "#aaa";
    statusLabel.textContent = "Status: Idle";
    uiContainer.appendChild(statusLabel);

    // ACTION BUTTONS ROW
    const actionButtonsRow = document.createElement("div");
    actionButtonsRow.style.display = "flex";
    actionButtonsRow.style.gap = "4px";

    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.style.flex = "2";
    toggleButton.style.padding = "6px";
    toggleButton.style.border = "1px solid";
    toggleButton.style.borderRadius = "6px";
    toggleButton.style.color = "#fff";
    toggleButton.style.fontWeight = "600";
    toggleButton.style.cursor = "pointer";
    toggleButton.addEventListener("click", () => setEnabled(!enabled));
    actionButtonsRow.appendChild(toggleButton);

    const manualSendBtn = document.createElement("button");
    manualSendBtn.type = "button";
    manualSendBtn.textContent = "\u27A4"; // Send icon
    manualSendBtn.title = "Send Now (Manual Trigger)";
    manualSendBtn.style.flex = "1";
    manualSendBtn.style.background = "#3e414e";
    manualSendBtn.style.border = "1px solid #666";
    manualSendBtn.style.borderRadius = "6px";
    manualSendBtn.style.color = "#fff";
    manualSendBtn.style.cursor = "pointer";
    manualSendBtn.addEventListener("click", () => {
      console.info("[Local Dev Agent] Manual send triggered.");
      performAutomatedSend();
    });
    actionButtonsRow.appendChild(manualSendBtn);

    uiContainer.appendChild(actionButtonsRow);

    // DEBUG OPTIONS HEADER
    const debugHeader = document.createElement("div");
    debugHeader.textContent = "Debug / Format Options:";
    debugHeader.style.fontSize = "10px";
    debugHeader.style.color = "#888";
    debugHeader.style.marginTop = "4px";
    uiContainer.appendChild(debugHeader);

    const configRow = document.createElement("div");
    configRow.style.display = "flex";
    configRow.style.gap = "8px";
    configRow.style.flexWrap = "wrap";

    const tsLabel = document.createElement("label");
    tsLabel.style.display = "flex";
    tsLabel.style.alignItems = "center";
    tsLabel.style.gap = "4px";
    tsLabel.style.cursor = "pointer";
    timestampToggle = document.createElement("input");
    timestampToggle.type = "checkbox";
    timestampToggle.checked = useTimestamp;
    timestampToggle.addEventListener("change", (e) => {
      useTimestamp = e.target.checked;
      window.localStorage.setItem(TIMESTAMP_STORAGE_KEY, String(useTimestamp));
    });
    tsLabel.appendChild(timestampToggle);
    tsLabel.appendChild(document.createTextNode("Time"));
    configRow.appendChild(tsLabel);

    const idLabel = document.createElement("label");
    idLabel.style.display = "flex";
    idLabel.style.alignItems = "center";
    idLabel.style.gap = "4px";
    idLabel.style.cursor = "pointer";
    idToggle = document.createElement("input");
    idToggle.type = "checkbox";
    idToggle.checked = useUniqueId;
    idToggle.addEventListener("change", (e) => {
      useUniqueId = e.target.checked;
      window.localStorage.setItem(USE_ID_STORAGE_KEY, String(useUniqueId));
    });
    idLabel.appendChild(idToggle);
    idLabel.appendChild(document.createTextNode("Short ID"));
    configRow.appendChild(idLabel);

    const skipLabel = document.createElement("label");
    skipLabel.style.display = "flex";
    skipLabel.style.alignItems = "center";
    skipLabel.style.gap = "4px";
    skipLabel.style.cursor = "pointer";
    skipLabel.style.color = "#ff9b9b"; // Reddish to indicate danger
    skipReadyToggle = document.createElement("input");
    skipReadyToggle.type = "checkbox";
    skipReadyToggle.checked = skipReadyCheck;
    skipReadyToggle.addEventListener("change", (e) => {
      skipReadyCheck = e.target.checked;
      window.localStorage.setItem(SKIP_READY_STORAGE_KEY, String(skipReadyCheck));
    });
    skipLabel.appendChild(skipReadyToggle);
    skipLabel.appendChild(document.createTextNode("Skip Ready Check"));
    configRow.appendChild(skipLabel);

    uiContainer.appendChild(configRow);

    const tagRow = document.createElement("div");
    tagRow.style.display = "flex";
    tagRow.style.alignItems = "center";
    tagRow.style.gap = "6px";
    tagRow.appendChild(document.createTextNode("Tag:"));
    tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.placeholder = "e.g. GPT";
    tagInput.value = tagText;
    tagInput.style.flex = "1";
    tagInput.style.background = "#1a1a1a";
    tagInput.style.border = "1px solid #555";
    tagInput.style.borderRadius = "4px";
    tagInput.style.color = "#fff";
    tagInput.style.padding = "2px 6px";
    tagInput.addEventListener("input", (e) => {
      tagText = e.target.value;
      window.localStorage.setItem(TAG_STORAGE_KEY, tagText);
    });
    tagRow.appendChild(tagInput);
    uiContainer.appendChild(tagRow);

    const labelText = document.createElement("label");
    labelText.textContent = "Custom Text:";
    labelText.style.fontWeight = "600";
    uiContainer.appendChild(labelText);

    textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = customText;
    textInput.style.background = "#1a1a1a";
    textInput.style.border = "1px solid #555";
    textInput.style.borderRadius = "4px";
    textInput.style.color = "#fff";
    textInput.style.padding = "4px 8px";
    textInput.addEventListener("input", (e) => {
      customText = e.target.value;
      window.localStorage.setItem(TEXT_STORAGE_KEY, customText);
    });
    uiContainer.appendChild(textInput);

    const attachHeader = document.createElement("div");
    attachHeader.style.display = "flex";
    attachHeader.style.justifyContent = "space-between";
    attachHeader.style.alignItems = "center";
    attachHeader.style.fontWeight = "600";
    attachHeader.textContent = "Attachments:";
    
    const paperclip = document.createElement("span");
    paperclip.textContent = "\uD83D\uDCCE";
    paperclip.style.cursor = "pointer";
    paperclip.style.fontSize = "16px";
    paperclip.title = "Select files";
    
    const hiddenFile = document.createElement("input");
    hiddenFile.type = "file";
    hiddenFile.multiple = true;
    hiddenFile.style.display = "none";
    hiddenFile.addEventListener("change", (e) => {
      const files = Array.from(e.target.files).map(f => f.name).join(", ");
      if (files) {
        attachmentPaths = (attachmentPaths ? attachmentPaths + "\n" : "") + files;
        attachmentsInput.value = attachmentPaths;
        window.localStorage.setItem(ATTACHMENTS_STORAGE_KEY, attachmentPaths);
      }
    });
    
    paperclip.addEventListener("click", () => hiddenFile.click());
    attachHeader.appendChild(paperclip);
    uiContainer.appendChild(attachHeader);

    attachmentsInput = document.createElement("textarea");
    attachmentsInput.rows = 2;
    attachmentsInput.value = attachmentPaths;
    attachmentsInput.placeholder = "File names or paths...";
    attachmentsInput.style.background = "#1a1a1a";
    attachmentsInput.style.border = "1px solid #555";
    attachmentsInput.style.borderRadius = "4px";
    attachmentsInput.style.color = "#fff";
    attachmentsInput.style.padding = "4px 8px";
    attachmentsInput.style.resize = "vertical";
    attachmentsInput.addEventListener("input", (e) => {
      attachmentPaths = e.target.value;
      window.localStorage.setItem(ATTACHMENTS_STORAGE_KEY, attachmentPaths);
    });
    uiContainer.appendChild(attachmentsInput);

    const labelInterval = document.createElement("label");
    labelInterval.textContent = "Interval (min):";
    labelInterval.style.fontWeight = "600";
    uiContainer.appendChild(labelInterval);

    intervalInput = document.createElement("input");
    intervalInput.type = "number";
    intervalInput.min = "0.1";
    intervalInput.step = "0.1";
    intervalInput.value = sendIntervalMin;
    intervalInput.style.background = "#1a1a1a";
    intervalInput.style.border = "1px solid #555";
    intervalInput.style.borderRadius = "4px";
    intervalInput.style.color = "#fff";
    intervalInput.style.padding = "4px 8px";
    intervalInput.addEventListener("input", (e) => {
      sendIntervalMin = parseFloat(e.target.value) || 0.1;
      window.localStorage.setItem(INTERVAL_STORAGE_KEY, String(sendIntervalMin));
      if (enabled) resetTimer();
    });
    uiContainer.appendChild(intervalInput);

    document.documentElement.appendChild(uiContainer);
    updateUI();

    if (enabled) {
      resetTimer();
      startTick();
    }
  }

  function setNativeValue(element, value) {
    const proto = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }

  function findComposer() {
    const candidates = Array.from(document.querySelectorAll([
      "textarea",
      "[contenteditable='true'][id='prompt-textarea']",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true']"
    ].join(",")));

    return candidates.find(element => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.id === "local-dev-agent-ui-container" || element.closest("#local-dev-agent-ui-container")) return false;
      return visible(element);
    }) || null;
  }

  function insertText(element, text) {
    element.focus();

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      setNativeValue(element, text);
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.execCommand("insertText", false, text);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }

  function findSendButton(checkDisabled = true) {
    // Priority 1: data-testid (including fruitjuice and other variants)
    const testid = document.querySelector("button[data-testid$='send-button'], [data-testid*='send-button']");
    if (testid instanceof HTMLElement && visible(testid)) {
       if (!checkDisabled || (testid instanceof HTMLButtonElement && !testid.disabled)) return testid;
    }

    // Priority 2: Broad selectors
    const selectors = [
      "button[aria-label*='Send']",
      "button[aria-label*='Отправ']",
      "button[title*='Send']",
      "button[title*='Отправ']",
      "div[data-testid*='send-button'] button",
      "form button[type='submit']",
      "[data-testid$='send-button']",
      ".sandbox-send-button"
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn instanceof HTMLElement && visible(btn)) {
        if (checkDisabled && (btn instanceof HTMLButtonElement) && btn.disabled) continue;

        const label = (btn.getAttribute("aria-label") || btn.title || btn.textContent || "").toLowerCase();
        if (label.includes("stop") || label.includes("остан")) continue;
        return btn;
      }
    }

    return null;
  }

  function isChatGPTReady() {
    const isGenerating = !!document.querySelector('button[aria-label*="Stop"], button[title*="Stop"], button[data-testid*="stop"], [class*="stop-button"], [id*="stop-button"]');
    
    // CRITICAL FIX: pass false to findSendButton so we don't stall when the button is disabled because of empty input
    const sendBtn = findSendButton(false); 
    const composer = findComposer();

    if (isGenerating) console.debug("[Local Dev Agent] Ready check: ChatGPT is generating.");
    if (!sendBtn) console.debug("[Local Dev Agent] Ready check: No send button structure found.");
    if (!composer) console.debug("[Local Dev Agent] Ready check: No composer found.");

    return !!sendBtn && !!composer && !isGenerating;
  }

  function sendMessageToChat(text) {
    const composer = findComposer();
    if (!composer) {
      console.error("[Local Dev Agent] Failed to send: Composer not found.");
      return false;
    }

    try {
      console.info("[Local Dev Agent] Inserting text into composer.");
      insertText(composer, text);

      // Wait a bit for UI to react
      window.setTimeout(() => {
        const sendButton = findSendButton(true);
        if (sendButton) {
          console.info("[Local Dev Agent] Clicking send button.");
          sendButton.click();
        } else {
          console.warn("[Local Dev Agent] Send button not ready/found, trying Enter key fallback.");
          // Fallback: Press Enter on the composer
          const enterEvent = new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          });
          composer.dispatchEvent(enterEvent);
        }
      }, 600);
      return true;
    } catch (e) {
      console.error("[Local Dev Agent] Error during send:", e);
      return false;
    }
  }

  const observer = new MutationObserver((mutations) => {
    scheduleScan();
    if (!document.getElementById("local-dev-agent-ui-container")) {
      installUI();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  installUI();
  window.setInterval(scanAndClick, SCAN_INTERVAL_MS);
  scanAndClick();
})();
