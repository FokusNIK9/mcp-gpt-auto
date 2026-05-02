(() => {
  "use strict";
  console.log("[Local Dev Agent] content.js STARTING...");

  const ALLOWED_DIALOG_TEXT = [
    "heroism-petri-causal.ngrok-free.dev",
    "heroism_petri_causal_ngrok_free_dev__jit_plugin.queueTask",
    "Local Dev Agent",
    "mcp-gpt-auto",
    "127.0.0.1:8787",
    "localhost:8787"
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
  const TAG_STORAGE_KEY = "localDevAgentTag";
  const USE_ID_STORAGE_KEY = "localDevAgentUseId";
  const SKIP_READY_STORAGE_KEY = "localDevAgentSkipReady";
  const SYNC_BRIDGE_STORAGE_KEY = "localDevAgentSyncBridge";
  const BRIDGE_PATHS_STORAGE_KEY = "localDevAgentBridgePaths";
  const CONFIRM_ONLY_STORAGE_KEY = "localDevAgentConfirmOnly"; // NEW

  let enabled = window.localStorage.getItem(STORAGE_KEY) !== "false";
  let customText = window.localStorage.getItem(TEXT_STORAGE_KEY) || "текст текст";
  let sendIntervalMin = parseFloat(window.localStorage.getItem(INTERVAL_STORAGE_KEY) || "1");
  let useTimestamp = window.localStorage.getItem(TIMESTAMP_STORAGE_KEY) === "true";
  let tagText = window.localStorage.getItem(TAG_STORAGE_KEY) || "";
  let useUniqueId = window.localStorage.getItem(USE_ID_STORAGE_KEY) === "true";
  let skipReadyCheck = window.localStorage.getItem(SKIP_READY_STORAGE_KEY) === "true";
  let syncFromBridge = window.localStorage.getItem(SYNC_BRIDGE_STORAGE_KEY) === "true";
  let bridgePaths = window.localStorage.getItem(BRIDGE_PATHS_STORAGE_KEY) || "text.txt";
  let confirmOnly = window.localStorage.getItem(CONFIRM_ONLY_STORAGE_KEY) === "true"; // NEW

  let isSending = false;
  let selectedFiles = []; 

  let uiContainer = null;
  let toggleButton = null;
  let confirmOnlyToggle = null; // NEW
  let settingsPanel = null;
  let textInput = null;
  let intervalInput = null;
  let tagInput = null;
  let idToggle = null;
  let timestampToggle = null;
  let skipReadyToggle = null;
  let syncToggle = null;
  let bridgePathsInput = null;
  let attachmentsInput = null;
  let progressBar = null;
  let countdownLabel = null;
  let statusLabel = null;

  let scanTimer = 0;
  let nextSendTime = 0;
  let tickTimer = 0;

  function visible(element) {
    if (!element) return false;
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
    if (!scope) return false;
    const text = scope.textContent || "";
    return ALLOWED_DIALOG_TEXT.some(needle => text.includes(needle));
  }

  function findDialogScope(button) {
    let node = button;
    for (let depth = 0; node && depth < 10; depth += 1) {
      if (node.getAttribute?.("role") === "dialog") return node;
      const text = node.textContent || "";
      if (text.includes("Local Dev Agent") || text.includes("Вызов инструмента") || text.includes("Action Bridge")) return node;
      node = node.parentElement;
    }
    return button.closest("main") || document.body;
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanAndClick();
    }, 500);
  }

  function scanAndClick() {
    // If confirmOnly is ON, we ignore the main 'enabled' toggle for clicking buttons
    if (!enabled && !confirmOnly) return;

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
          console.info("[Local Dev Agent] MATCH! Confirming allowlisted tool call.");
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

  async function tick() {
    if (!enabled || isSending) return;
    const now = Date.now();
    const remainingMs = nextSendTime - now;

    if (remainingMs <= 0) {
      const readyObj = isChatGPTReadyDetailed();
      if (skipReadyCheck || readyObj.ready) {
        console.info("[Local Dev Agent] Timer expired. Attempting send.");
        resetTimer(); 
        const success = await performAutomatedSend();
        if (!success) {
           console.warn("[Local Dev Agent] Send could not be initiated.");
           if (statusLabel) statusLabel.textContent = "Status: Initiation failed";
        }
      } else {
        if (statusLabel) statusLabel.textContent = `Status: Waiting (${readyObj.reason})`;
      }
      return;
    }

    if (statusLabel && (statusLabel.textContent.startsWith("Status: Waiting") || statusLabel.textContent === "Status: Sent OK")) {
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

  async function fetchFileProxy(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "FETCH_FILE", url: url }, (response) => {
        if (!response) {
           reject(new Error("No response from background script"));
           return;
        }
        if (response.ok) {
           fetch(response.data)
             .then(res => res.blob())
             .then(blob => resolve(blob))
             .catch(e => reject(e));
        } else {
           reject(new Error(response.error));
        }
      });
    });
  }

  async function fetchBridgeFiles() {
    if (!syncFromBridge || !bridgePaths) return [];
    const paths = bridgePaths.split(",").map(p => p.trim()).filter(p => p.length > 0);
    if (statusLabel) statusLabel.textContent = "Status: Fetching...";
    
    const fetchPromises = paths.map(async (p) => {
       try {
          const url = `http://127.0.0.1:8787/workspace/file?path=${encodeURIComponent(p)}`;
          const blob = await fetchFileProxy(url);
          const filename = p.split(/[/\\]/).pop() || "synced_file";
          return new File([blob], filename, { type: blob.type || "text/plain" });
       } catch (e) {
          console.error(`[Local Dev Agent] Proxy fetch failed for ${p}:`, e);
          return null;
       }
    });

    const results = await Promise.all(fetchPromises);
    return results.filter(f => f !== null);
  }

  async function performAutomatedSend() {
    if (isSending) return false;
    let prefixes = [];
    if (tagText.trim()) prefixes.push(`[${tagText.trim()}]`);
    if (useUniqueId) prefixes.push(`{#${generateShortId()}}`);
    if (useTimestamp) {
      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      prefixes.push(`(${timeStr})`);
    }
    let finalMsg = prefixes.join(" ") + (prefixes.length ? " " : "") + customText;

    let filesToSend = [...selectedFiles];
    if (syncFromBridge) {
       const remoteFiles = await fetchBridgeFiles();
       filesToSend = [...filesToSend, ...remoteFiles];
    }

    return sendMessageToChat(finalMsg, filesToSend);
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

  function setConfirmOnly(nextVal) {
    confirmOnly = nextVal;
    window.localStorage.setItem(CONFIRM_ONLY_STORAGE_KEY, String(confirmOnly));
    updateUI();
    if (confirmOnly) scheduleScan();
  }

  function updateUI() {
    if (!toggleButton) return;
    toggleButton.textContent = enabled ? "Agent Auto: ON" : "Agent Auto: OFF";
    toggleButton.style.background = enabled ? "#10a37f" : "#3a3a3a";
    toggleButton.style.borderColor = enabled ? "#38d9b4" : "#666";

    if (confirmOnlyToggle) {
       confirmOnlyToggle.textContent = confirmOnly ? "Accept: ON" : "Accept: OFF";
       confirmOnlyToggle.style.background = confirmOnly ? "#10a37f" : "#3a3a3a";
       confirmOnlyToggle.style.borderColor = confirmOnly ? "#38d9b4" : "#666";
    }

    if (textInput) textInput.value = customText;
    if (intervalInput) intervalInput.value = sendIntervalMin;
    if (tagInput) tagInput.value = tagText;
    if (idToggle) idToggle.checked = useUniqueId;
    if (timestampToggle) timestampToggle.checked = useTimestamp;
    if (skipReadyToggle) skipReadyToggle.checked = skipReadyCheck;
    if (syncToggle) syncToggle.checked = syncFromBridge;
    if (bridgePathsInput) bridgePathsInput.value = bridgePaths;

    if (!enabled) {
      if (countdownLabel) countdownLabel.textContent = "Auto Mode: OFF";
      if (progressBar) progressBar.style.height = "0%";
      if (statusLabel) statusLabel.textContent = "Status: Disabled";
    } else {
       if (statusLabel && (statusLabel.textContent === "Status: Disabled" || statusLabel.textContent === "Status: Idle")) {
          statusLabel.textContent = "Status: Idle";
       }
    }
    updateAttachmentsUI();
  }

  function updateAttachmentsUI() {
     if (!attachmentsInput) return;
     attachmentsInput.innerHTML = "";
     if (selectedFiles.length === 0) {
        const placeholder = document.createElement("div");
        placeholder.textContent = "No files...";
        attachmentsInput.appendChild(placeholder);
        return;
     }
     selectedFiles.forEach((file, index) => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        const name = document.createElement("span");
        name.textContent = file.name;
        const remove = document.createElement("span");
        remove.textContent = " \u2715";
        remove.style.cursor = "pointer";
        remove.style.color = "#ff4d4d";
        remove.addEventListener("click", () => {
           selectedFiles.splice(index, 1);
           updateAttachmentsUI();
        });
        item.appendChild(name);
        item.appendChild(remove);
        attachmentsInput.appendChild(item);
     });
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
    uiContainer.appendChild(barContainer);

    progressBar = document.createElement("div");
    progressBar.style.width = "100%";
    progressBar.style.height = "100%";
    progressBar.style.background = "#10a37f";
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

    const actionButtonsRow = document.createElement("div");
    actionButtonsRow.style.display = "flex";
    actionButtonsRow.style.gap = "4px";

    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.style.flex = "4";
    toggleButton.style.padding = "6px";
    toggleButton.style.border = "1px solid #666";
    toggleButton.style.borderRadius = "6px";
    toggleButton.style.color = "#fff";
    toggleButton.style.cursor = "pointer";
    toggleButton.addEventListener("click", () => setEnabled(!enabled));
    actionButtonsRow.appendChild(toggleButton);

    // NEW: Accept All Buttons Toggle
    confirmOnlyToggle = document.createElement("button");
    confirmOnlyToggle.type = "button";
    confirmOnlyToggle.style.flex = "3";
    confirmOnlyToggle.style.padding = "6px";
    confirmOnlyToggle.style.border = "1px solid #666";
    confirmOnlyToggle.style.borderRadius = "6px";
    confirmOnlyToggle.style.color = "#fff";
    confirmOnlyToggle.style.cursor = "pointer";
    confirmOnlyToggle.title = "Auto-confirm tool calls even when Auto-timer is OFF";
    confirmOnlyToggle.addEventListener("click", () => setConfirmOnly(!confirmOnly));
    actionButtonsRow.appendChild(confirmOnlyToggle);

    const settingsToggleBtn = document.createElement("button");
    settingsToggleBtn.type = "button";
    settingsToggleBtn.textContent = "\u2699";
    settingsToggleBtn.style.flex = "1";
    settingsToggleBtn.style.background = "#3e414e";
    settingsToggleBtn.style.border = "1px solid #666";
    settingsToggleBtn.style.borderRadius = "6px";
    settingsToggleBtn.style.color = "#fff";
    settingsToggleBtn.style.cursor = "pointer";
    settingsToggleBtn.addEventListener("click", () => {
       const isHidden = settingsPanel.style.display === "none";
       settingsPanel.style.display = isHidden ? "flex" : "none";
    });
    actionButtonsRow.appendChild(settingsToggleBtn);

    const manualSendBtn = document.createElement("button");
    manualSendBtn.type = "button";
    manualSendBtn.textContent = "\u27A4";
    manualSendBtn.style.flex = "1";
    manualSendBtn.style.background = "#3e414e";
    manualSendBtn.style.border = "1px solid #666";
    manualSendBtn.style.borderRadius = "6px";
    manualSendBtn.style.color = "#fff";
    manualSendBtn.style.cursor = "pointer";
    manualSendBtn.addEventListener("click", async () => {
      if (statusLabel) statusLabel.textContent = "Status: Manual trigger...";
      await performAutomatedSend();
    });
    actionButtonsRow.appendChild(manualSendBtn);
    uiContainer.appendChild(actionButtonsRow);

    settingsPanel = document.createElement("div");
    settingsPanel.style.display = "none";
    settingsPanel.style.flexDirection = "column";
    settingsPanel.style.gap = "6px";
    settingsPanel.style.borderTop = "1px solid #444";
    settingsPanel.style.paddingTop = "6px";
    uiContainer.appendChild(settingsPanel);

    const createToggle = (label, current, callback) => {
       const l = document.createElement("label");
       l.style.display = "flex";
       l.style.alignItems = "center";
       l.style.gap = "4px";
       l.style.cursor = "pointer";
       const i = document.createElement("input");
       i.type = "checkbox";
       i.checked = current;
       i.addEventListener("change", (e) => callback(e.target.checked));
       l.appendChild(i);
       l.appendChild(document.createTextNode(label));
       return { label: l, input: i };
    };

    const ts = createToggle("Time", useTimestamp, (v) => { useTimestamp = v; window.localStorage.setItem(TIMESTAMP_STORAGE_KEY, String(v)); });
    timestampToggle = ts.input;
    settingsPanel.appendChild(ts.label);

    const sid = createToggle("Short ID", useUniqueId, (v) => { useUniqueId = v; window.localStorage.setItem(USE_ID_STORAGE_KEY, String(v)); });
    idToggle = sid.input;
    settingsPanel.appendChild(sid.label);

    const skp = createToggle("Skip Check", skipReadyCheck, (v) => { skipReadyCheck = v; window.localStorage.setItem(SKIP_READY_STORAGE_KEY, String(v)); });
    skp.label.style.color = "#ff9b9b";
    skipReadyToggle = skp.input;
    settingsPanel.appendChild(skp.label);

    tagInput = document.createElement("input");
    tagInput.type = "text";
    tagInput.placeholder = "Tag (e.g. GPT)";
    tagInput.value = tagText;
    tagInput.style.background = "#1a1a1a";
    tagInput.style.color = "#fff";
    tagInput.addEventListener("input", (e) => { tagText = e.target.value; window.localStorage.setItem(TAG_STORAGE_KEY, tagText); });
    settingsPanel.appendChild(tagInput);

    const syncBox = createToggle("Sync from Bridge", syncFromBridge, (v) => { syncFromBridge = v; window.localStorage.setItem(SYNC_BRIDGE_STORAGE_KEY, String(v)); });
    syncBox.label.style.color = "#38d9b4";
    syncToggle = syncBox.input;
    settingsPanel.appendChild(syncBox.label);

    bridgePathsInput = document.createElement("input");
    bridgePathsInput.type = "text";
    bridgePathsInput.value = bridgePaths;
    bridgePathsInput.style.background = "#1a1a1a";
    bridgePathsInput.style.color = "#fff";
    bridgePathsInput.addEventListener("input", (e) => { bridgePaths = e.target.value; window.localStorage.setItem(BRIDGE_PATHS_STORAGE_KEY, bridgePaths); });
    settingsPanel.appendChild(bridgePathsInput);

    textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = customText;
    textInput.style.background = "#1a1a1a";
    textInput.style.color = "#fff";
    textInput.addEventListener("input", (e) => { customText = e.target.value; window.localStorage.setItem(TEXT_STORAGE_KEY, customText); });
    uiContainer.appendChild(textInput);

    const attachHeader = document.createElement("div");
    attachHeader.style.display = "flex";
    attachHeader.style.justifyContent = "space-between";
    attachHeader.textContent = "Attachments:";
    const paperclip = document.createElement("span");
    paperclip.textContent = "\uD83D\uDCCE";
    paperclip.style.cursor = "pointer";
    paperclip.addEventListener("click", () => hiddenFile.click());
    const hiddenFile = document.createElement("input");
    hiddenFile.type = "file";
    hiddenFile.multiple = true;
    hiddenFile.style.display = "none";
    hiddenFile.addEventListener("change", (e) => {
       const files = Array.from(e.target.files).filter(f => f.size > 0);
       selectedFiles = [...selectedFiles, ...files];
       updateAttachmentsUI();
    });
    attachHeader.appendChild(paperclip);
    uiContainer.appendChild(attachHeader);

    attachmentsInput = document.createElement("div");
    attachmentsInput.style.minHeight = "20px";
    attachmentsInput.style.maxHeight = "60px";
    attachmentsInput.style.overflowY = "auto";
    attachmentsInput.style.background = "#1a1a1a";
    uiContainer.appendChild(attachmentsInput);

    intervalInput = document.createElement("input");
    intervalInput.type = "number";
    intervalInput.step = "0.1";
    intervalInput.value = sendIntervalMin;
    intervalInput.style.background = "#1a1a1a";
    intervalInput.style.color = "#fff";
    intervalInput.addEventListener("input", (e) => {
       sendIntervalMin = parseFloat(e.target.value) || 0.1;
       window.localStorage.setItem(INTERVAL_STORAGE_KEY, String(sendIntervalMin));
       if (enabled) resetTimer();
    });
    uiContainer.appendChild(intervalInput);

    document.body.appendChild(uiContainer);
    updateUI();
    if (enabled) { resetTimer(); startTick(); }
  }

  function generateShortId() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let res = "";
    for(let i=0; i<4; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
  }

  function setNativeValue(element, value) {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.value = value;
  }

  function findComposer() {
    const selectors = ["textarea", "#prompt-textarea", "[contenteditable='true'][role='textbox']"];
    for (const sel of selectors) {
       const el = document.querySelector(sel);
       if (el && visible(el) && !el.closest("#local-dev-agent-ui-container")) return el;
    }
    return null;
  }

  function findSendButton(checkDisabled = true) {
    const selectors = ["button[data-testid*='send-button']", "button[aria-label*='Send']", "button[aria-label*='Отправ']", "form button[type='submit']"];
    for (const sel of selectors) {
       const btn = document.querySelector(sel);
       if (btn && visible(btn)) {
          if (checkDisabled && (btn instanceof HTMLButtonElement) && btn.disabled) continue;
          return btn;
       }
    }
    return null;
  }

  function isChatGPTReadyDetailed() {
    const stopBtn = document.querySelector('button[aria-label*="Stop"], button[title*="Stop"], [class*="stop-button"], [data-testid*="stop"]');
    if (stopBtn && visible(stopBtn)) return { ready: false, reason: "Busy (Stop Btn)" };
    const composer = findComposer();
    if (!composer) return { ready: false, reason: "No Composer" };
    return { ready: true, reason: "" };
  }

  function uploadFilesToChatGPT(files) {
     const fileInput = document.querySelector('input[type="file"][multiple], input[type="file"]');
     if (!fileInput) return;
     const dataTransfer = new DataTransfer();
     files.forEach(f => dataTransfer.items.add(f));
     fileInput.files = dataTransfer.files;
     fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function sendMessageToChat(text, files = []) {
    if (isSending) return false;
    const composer = findComposer();
    if (!composer) return false;
    isSending = true;
    try {
      insertText(composer, ""); 
      if (files.length > 0) {
         uploadFilesToChatGPT(files);
         if (statusLabel) statusLabel.textContent = "Status: Uploading...";
      }
      insertText(composer, text);
      const checkAndClick = (attempts) => {
         const stopBtn = document.querySelector('button[aria-label*="Stop"], button[title*="Stop"], [data-testid*="stop"]');
         if (stopBtn && visible(stopBtn)) {
            if (statusLabel) statusLabel.textContent = "Status: Waiting for ChatGPT...";
            window.setTimeout(() => checkAndClick(attempts), 1000);
            return;
         }
         if (attempts <= 0) {
            const enter = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true });
            composer.dispatchEvent(enter);
            selectedFiles = [];
            updateAttachmentsUI();
            if (statusLabel) statusLabel.textContent = "Status: Sent (Enter)";
            isSending = false;
            return;
         }
         const sendBtn = findSendButton(true);
         if (sendBtn) {
            sendBtn.click();
            selectedFiles = [];
            updateAttachmentsUI();
            if (statusLabel) statusLabel.textContent = "Status: Sent OK";
            isSending = false;
         } else {
            if (statusLabel) statusLabel.textContent = `Status: Processing (${attempts})...`;
            window.setTimeout(() => checkAndClick(attempts - 1), 1000);
         }
      };
      window.setTimeout(() => checkAndClick(10), 1000);
      return true;
    } catch (e) {
      isSending = false;
      if (statusLabel) statusLabel.textContent = "Status: Error";
      return false;
    }
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

  const observer = new MutationObserver(() => {
    scheduleScan();
    if (!document.getElementById("local-dev-agent-ui-container") && document.body) installUI();
  });
  if (document.body) { observer.observe(document.body, { childList: true, subtree: true }); installUI(); }
  else { window.addEventListener("DOMContentLoaded", () => { observer.observe(document.body, { childList: true, subtree: true }); installUI(); }); }
  window.setInterval(scanAndClick, SCAN_INTERVAL_MS);
})();
