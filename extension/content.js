/**
 * Instagram Reply Assist — Content Script
 * Runs on instagram.com, detects DM threads & comments,
 * reads message text, injects the AI reply side panel.
 *
 * SECURITY_NOTE: No secrets are handled here. All API calls
 * are routed through the background service worker.
 */

(function () {
  "use strict";

  /* ───────── Constants ───────── */
  const PANEL_ID = "ira-panel-root";
  const DEBOUNCE_MS = 300;
  const DM_PATH_RE = /\/direct\/t\//;
  const COMMENT_PATH_RE = /\/p\/|\/reel\//;

  /* ───────── State ───────── */
  let debounceTimer = null;
  let currentMessageText = "";
  let panelInjected = false;

  /* ───────── Helpers ───────── */

  /** Debounce wrapper */
  function debounce(fn, ms) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** Detect page context */
  function getPageContext() {
    const path = window.location.pathname;
    if (DM_PATH_RE.test(path)) return "dm";
    if (COMMENT_PATH_RE.test(path)) return "comment";
    return null;
  }

  /** Read the latest visible message text from the DM thread.
   *  We target stable attributes (aria-label, role) rather than
   *  obfuscated class names. */
  function readLatestMessage() {
    const ctx = getPageContext();
    if (!ctx) return "";

    if (ctx === "dm") {
      // DM view — grab last message row
      const messageNodes = document.querySelectorAll(
        '[role="row"] [dir="auto"], [role="listbox"] [dir="auto"]'
      );
      if (messageNodes.length === 0) return "";
      // Last message from the OTHER person (even-index rows are theirs in most layouts)
      // We take the last dir="auto" element as the most recent visible message
      const last = messageNodes[messageNodes.length - 1];
      return (last && last.textContent) ? last.textContent.trim() : "";
    }

    if (ctx === "comment") {
      // Comment view — grab the focused / first comment
      const comments = document.querySelectorAll(
        'ul [dir="auto"], [role="button"] + [dir="auto"]'
      );
      if (comments.length === 0) return "";
      return comments[0].textContent.trim();
    }

    return "";
  }

  /* ───────── Panel Injection ───────── */

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = getPanelHTML();
    document.body.appendChild(panel);
    panelInjected = true;
    bindPanelEvents(panel);
  }

  function getPanelHTML() {
    return `
      <div class="ira-panel">
        <div class="ira-header">
          <span class="ira-logo">💬</span>
          <span class="ira-title">Reply Assist</span>
          <button class="ira-btn-close" id="ira-close-btn" title="Close panel">✕</button>
        </div>

        <div class="ira-section">
          <label class="ira-label">Detected Message</label>
          <div class="ira-detected-msg" id="ira-detected-msg">Click "Detect Message" to read the current conversation.</div>
        </div>

        <div class="ira-section ira-actions-row">
          <button class="ira-btn ira-btn-secondary" id="ira-detect-btn">🔍 Detect Message</button>
          <button class="ira-btn ira-btn-primary" id="ira-generate-btn" disabled>⚡ Generate Reply</button>
        </div>

        <div class="ira-section" id="ira-intent-section" style="display:none;">
          <label class="ira-label">Intent</label>
          <span class="ira-intent-badge" id="ira-intent-badge"></span>
        </div>

        <div class="ira-section" id="ira-escalation-section" style="display:none;">
          <div class="ira-escalation-box">
            <strong>⚠️ ESCALATION REQUIRED</strong>
            <p id="ira-escalation-text"></p>
            <p class="ira-escalation-action">Forward to brand owner immediately.</p>
          </div>
        </div>

        <div class="ira-section" id="ira-reply-section" style="display:none;">
          <label class="ira-label">AI Reply <small>(editable)</small></label>
          <textarea class="ira-reply-box" id="ira-reply-box" rows="5"></textarea>
          <div class="ira-actions-row" style="margin-top:8px;">
            <button class="ira-btn ira-btn-secondary" id="ira-regen-btn">🔄 Regenerate</button>
            <button class="ira-btn ira-btn-primary" id="ira-copy-btn">📋 Copy Reply</button>
          </div>
        </div>

        <div class="ira-section" id="ira-loading-section" style="display:none;">
          <div class="ira-loading">Generating reply…</div>
        </div>

        <div class="ira-section" id="ira-error-section" style="display:none;">
          <div class="ira-error-box" id="ira-error-text"></div>
        </div>

        <div class="ira-footer">
          <button class="ira-btn-link" id="ira-open-settings">⚙ Settings</button>
        </div>
      </div>
    `;
  }

  function bindPanelEvents(panel) {
    /* Close */
    panel.querySelector("#ira-close-btn").addEventListener("click", () => {
      panel.style.display = "none";
    });

    /* Detect message */
    panel.querySelector("#ira-detect-btn").addEventListener("click", () => {
      detectAndDisplay();
    });

    /* Generate reply */
    panel.querySelector("#ira-generate-btn").addEventListener("click", () => {
      generateReply();
    });

    /* Regenerate */
    panel.querySelector("#ira-regen-btn").addEventListener("click", () => {
      generateReply();
    });

    /* Copy */
    panel.querySelector("#ira-copy-btn").addEventListener("click", () => {
      const box = document.getElementById("ira-reply-box");
      navigator.clipboard.writeText(box.value).then(() => {
        const btn = document.getElementById("ira-copy-btn");
        btn.textContent = "✅ Copied!";
        setTimeout(() => { btn.textContent = "📋 Copy Reply"; }, 1500);
      });
    });

    /* Open settings */
    panel.querySelector("#ira-open-settings").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SETTINGS" });
    });
  }

  /* ───────── Detect Message ───────── */

  const detectAndDisplay = debounce(function () {
    const text = readLatestMessage();
    const el = document.getElementById("ira-detected-msg");
    const genBtn = document.getElementById("ira-generate-btn");

    if (text) {
      currentMessageText = text;
      el.textContent = text;
      el.classList.add("ira-msg-active");
      genBtn.disabled = false;
    } else {
      el.textContent = "No message detected. Navigate to a DM thread or comment, then try again.";
      el.classList.remove("ira-msg-active");
      genBtn.disabled = true;
    }

    // Reset other sections
    hideSection("ira-reply-section");
    hideSection("ira-intent-section");
    hideSection("ira-escalation-section");
    hideSection("ira-error-section");
  }, DEBOUNCE_MS);

  /* ───────── Generate Reply ───────── */

  function generateReply() {
    if (!currentMessageText) return;

    showSection("ira-loading-section");
    hideSection("ira-reply-section");
    hideSection("ira-intent-section");
    hideSection("ira-escalation-section");
    hideSection("ira-error-section");

    const context = getPageContext() === "dm" ? "Instagram DM" : "Instagram Comment";

    chrome.runtime.sendMessage(
      {
        type: "GENERATE_REPLY",
        payload: { messageText: currentMessageText, platformContext: context },
      },
      (response) => {
        hideSection("ira-loading-section");

        if (chrome.runtime.lastError) {
          showError("Extension error — please reload the page and try again.");
          return;
        }

        if (!response || response.error) {
          showError(response ? response.error : "Unknown error from background worker.");
          return;
        }

        if (response.escalate) {
          showEscalation(response.escalationReason);
          return;
        }

        // Show intent
        if (response.intent) {
          const badge = document.getElementById("ira-intent-badge");
          badge.textContent = response.intent;
          badge.className = "ira-intent-badge ira-intent-" + response.intent.toLowerCase().replace(/\s+/g, "-");
          showSection("ira-intent-section");
        }

        // Show reply
        document.getElementById("ira-reply-box").value = response.reply;
        showSection("ira-reply-section");
      }
    );
  }

  /* ───────── UI Helpers ───────── */

  function showSection(id) { document.getElementById(id).style.display = "block"; }
  function hideSection(id) { document.getElementById(id).style.display = "none"; }

  function showError(msg) {
    document.getElementById("ira-error-text").textContent = msg;
    showSection("ira-error-section");
  }

  function showEscalation(reason) {
    document.getElementById("ira-escalation-text").textContent = reason || "This message requires brand owner attention.";
    showSection("ira-escalation-section");
  }

  /* ───────── Toggle Button (floating) ───────── */

  function injectToggleButton() {
    if (document.getElementById("ira-toggle-btn")) return;
    const btn = document.createElement("button");
    btn.id = "ira-toggle-btn";
    btn.className = "ira-toggle-btn";
    btn.textContent = "💬";
    btn.title = "Open Reply Assist";
    btn.addEventListener("click", () => {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) {
        createPanel();
      } else {
        panel.style.display = panel.style.display === "none" ? "block" : "none";
      }
    });
    document.body.appendChild(btn);
  }

  /* ───────── MutationObserver — watch for SPA navigations ───────── */

  function onDOMChange() {
    const ctx = getPageContext();
    if (ctx) {
      injectToggleButton();
      // Auto-create panel if not existing
      if (!document.getElementById(PANEL_ID)) {
        createPanel();
      }
    }
  }

  const observer = new MutationObserver(debounce(onDOMChange, 500));
  observer.observe(document.body, { childList: true, subtree: true });

  /* ───────── Init ───────── */
  onDOMChange();
})();
