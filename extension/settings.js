/**
 * Instagram Reply Assist — Settings Page Script
 * Loads/saves brand knowledge base and API key from chrome.storage.local.
 *
 * SECURITY_NOTE: API key is stored in chrome.storage.local (not synced).
 * It is never logged or exposed in console output.
 */

"use strict";

const FIELDS = [
  "apiKey",
  "brandName",
  "productCatalogue",
  "returnPolicy",
  "shippingInfo",
  "toneStyle",
  "toneGuide",
  "escalationKeywords",
  "exampleReplies",
];

/* ───────── DOM Ready ───────── */

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document.getElementById("resetBtn").addEventListener("click", resetSettings);
  document.getElementById("testKeyBtn").addEventListener("click", testApiKey);
});

/* ───────── Load ───────── */

function loadSettings() {
  chrome.storage.local.get(FIELDS, (data) => {
    FIELDS.forEach((field) => {
      const el = document.getElementById(field);
      if (el && data[field] !== undefined) {
        el.value = data[field];
      }
    });
    showStatus("Settings loaded.", "info");
    // Clear status after 2s
    setTimeout(clearStatus, 2000);
  });
}

/* ───────── Save ───────── */

function saveSettings() {
  const data = {};
  let hasErrors = false;

  FIELDS.forEach((field) => {
    const el = document.getElementById(field);
    if (el) {
      // Basic input sanitization — trim whitespace
      data[field] = el.value.trim();
    }
  });

  // Validation: API key must be present
  if (!data.apiKey) {
    showStatus("Please enter your Anthropic API key.", "error");
    document.getElementById("apiKey").focus();
    return;
  }

  // Validation: Brand name must be present
  if (!data.brandName) {
    showStatus("Please enter your brand name.", "error");
    document.getElementById("brandName").focus();
    return;
  }

  chrome.storage.local.set(data, () => {
    if (chrome.runtime.lastError) {
      showStatus("Error saving settings. Please try again.", "error");
      return;
    }
    showStatus("✅ Settings saved successfully!", "success");
    setTimeout(clearStatus, 3000);
  });
}

/* ───────── Reset ───────── */

function resetSettings() {
  if (!confirm("Are you sure you want to reset all settings? This cannot be undone.")) return;

  chrome.storage.local.remove(FIELDS, () => {
    FIELDS.forEach((field) => {
      const el = document.getElementById(field);
      if (el) {
        if (el.tagName === "SELECT") {
          el.selectedIndex = 0;
        } else {
          el.value = "";
        }
      }
    });
    showStatus("Settings have been reset.", "info");
    setTimeout(clearStatus, 3000);
  });
}

/* ───────── Test API Key ───────── */

function testApiKey() {
  const key = document.getElementById("apiKey").value.trim();
  if (!key) {
    showStatus("Enter an API key first.", "error");
    return;
  }

  showStatus("Testing API key…", "info");

  chrome.runtime.sendMessage(
    { type: "TEST_API_KEY", apiKey: key },
    (response) => {
      if (chrome.runtime.lastError) {
        showStatus("Could not reach background worker. Reload the extension.", "error");
        return;
      }
      if (response && response.success) {
        showStatus("✅ API key is valid!", "success");
      } else {
        showStatus("❌ " + (response ? response.error : "Invalid API key."), "error");
      }
      setTimeout(clearStatus, 4000);
    }
  );
}

/* ───────── Status Bar Helpers ───────── */

function showStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status " + type;
}

function clearStatus() {
  const el = document.getElementById("status");
  el.textContent = "";
  el.className = "status";
}
