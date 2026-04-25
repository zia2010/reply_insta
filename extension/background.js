/**
 * Instagram Reply Assist — Background Service Worker
 * Handles Claude API calls, settings management, and message routing.
 *
 * SECURITY_NOTE: The Anthropic API key is read from chrome.storage.local
 * and NEVER logged or exposed in error messages.
 */

/* ───────── Mock Module (remove for production) ───────── */
// TO DISABLE MOCK: Delete the next line and delete mock.js
try { importScripts("mock.js"); } catch (e) { /* mock.js not present — real mode */ }

/* ───────── Message Router ───────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GENERATE_REPLY") {
    handleGenerateReply(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: sanitizeError(err) }));
    return true; // keep the message channel open for async response
  }

  if (message.type === "OPEN_SETTINGS") {
    chrome.runtime.openOptionsPage
      ? chrome.runtime.openOptionsPage()
      : chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    return false;
  }

  if (message.type === "TEST_API_KEY") {
    testApiKey(message.apiKey)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: sanitizeError(err) }));
    return true;
  }
});

/* ───────── Core: Generate Reply ───────── */

async function handleGenerateReply({ messageText, platformContext }) {
  // Load brand data + API key from storage
  const data = await getStorage([
    "apiKey",
    "brandName",
    "productCatalogue",
    "returnPolicy",
    "shippingInfo",
    "toneGuide",
    "toneStyle",
    "escalationKeywords",
    "exampleReplies",
  ]);

  /* ── Mock mode bypass (remove for production) ── */
  if (typeof MOCK_MODE !== "undefined" && MOCK_MODE === true) {
    // Simulate network delay (400-1200ms)
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 800));
    return handleMockReply(messageText, data);
  }
  /* ── End mock bypass ── */

  if (!data.apiKey) {
    return { error: "API key not configured. Open extension settings to add your Anthropic API key." };
  }

  if (!data.brandName) {
    return { error: "Brand knowledge base not configured. Open extension settings to set up your brand info." };
  }

  const systemPrompt = buildSystemPrompt(data, platformContext);
  const userPrompt = buildUserPrompt(messageText, platformContext);

  // Call Claude API
  const apiResponse = await callClaude(data.apiKey, systemPrompt, userPrompt);

  // Parse response
  return parseClaudeResponse(apiResponse);
}

/* ───────── System Prompt Builder ───────── */

function buildSystemPrompt(data, platformContext) {
  const tone = data.toneStyle || "friendly";
  const toneGuide = data.toneGuide || "";
  const escalationKeywords = data.escalationKeywords || "refund, legal, lawyer, sue, scam, fraud, wrong order, damaged";

  return `You are a customer support assistant for ${data.brandName || "the brand"}, an ecommerce brand. Reply to ${platformContext || "Instagram"} messages in the brand's voice.

TONE: ${tone}
${toneGuide ? "TONE DETAILS: " + toneGuide : ""}

PRODUCTS:
${data.productCatalogue || "No product catalogue provided."}

POLICIES:
- Returns: ${data.returnPolicy || "Not specified."}
- Shipping: ${data.shippingInfo || "Not specified."}

ESCALATION: If the message contains complaints about: ${escalationKeywords} — or abusive language, threats, or demands you cannot handle — respond ONLY with the exact format:
ESCALATE: [reason]

${data.exampleReplies ? "EXAMPLE REPLIES:\n" + data.exampleReplies : ""}

REPLY RULES:
- Keep replies under 150 words.
- Always use the customer's first name if visible.
- Never make up information not listed above.
- If unsure, say "Let me check and get back to you!"
- Do not use markdown formatting — plain text only.

RESPONSE FORMAT:
First line must be one of: INTENT: Inquiry | INTENT: Complaint | INTENT: Compliment | INTENT: Order Issue | INTENT: Pricing
Then a blank line, then the reply text.
If escalating, respond ONLY with: ESCALATE: [reason]`;
}

function buildUserPrompt(messageText, platformContext) {
  return `Platform: ${platformContext}\nCustomer message:\n"${messageText}"`;
}

/* ───────── Claude API Call ───────── */

async function callClaude(apiKey, systemPrompt, userPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // SECURITY_NOTE: dangerous-direct-browser-access required for
      // Chrome extension service workers calling the API directly.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error("Invalid API key. Please check your Anthropic API key in settings.");
    if (status === 429) throw new Error("Rate limit exceeded. Please wait a moment and try again.");
    if (status === 500 || status === 503) throw new Error("Anthropic API is temporarily unavailable. Please try again later.");
    throw new Error(`API request failed (HTTP ${status}). Please try again.`);
  }

  return response.json();
}

/* ───────── Response Parser ───────── */

function parseClaudeResponse(apiResponse) {
  if (!apiResponse || !apiResponse.content || !apiResponse.content[0]) {
    return { error: "Received an empty response from Claude. Please try again." };
  }

  const text = apiResponse.content[0].text.trim();

  // Check for escalation
  if (text.startsWith("ESCALATE:")) {
    return {
      escalate: true,
      escalationReason: text.replace("ESCALATE:", "").trim(),
    };
  }

  // Parse intent + reply
  const intentMatch = text.match(/^INTENT:\s*(.+)/i);
  let intent = "Inquiry";
  let reply = text;

  if (intentMatch) {
    intent = intentMatch[1].trim();
    // Remove the INTENT line from the reply
    reply = text.replace(/^INTENT:\s*.+\n?\n?/i, "").trim();
  }

  return { intent, reply, escalate: false };
}

/* ───────── API Key Test ───────── */

async function testApiKey(apiKey) {
  /* ── Mock mode bypass ── */
  if (typeof MOCK_MODE !== "undefined" && MOCK_MODE === true) {
    return { success: true, mock: true };
  }
  /* ── End mock bypass ── */
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say OK" }],
      }),
    });

    if (response.ok) return { success: true };
    if (response.status === 401) return { success: false, error: "Invalid API key." };
    return { success: false, error: `API returned status ${response.status}.` };
  } catch (e) {
    return { success: false, error: "Network error — could not reach Anthropic API." };
  }
}

/* ───────── Utilities ───────── */

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

/**
 * SECURITY_NOTE: Strip any potential API key leakage from error messages.
 */
function sanitizeError(err) {
  let msg = err && err.message ? err.message : "An unexpected error occurred.";
  // Remove anything that looks like an API key (sk-ant-...)
  msg = msg.replace(/sk-ant-[a-zA-Z0-9\-_]+/g, "[REDACTED]");
  return msg;
}
