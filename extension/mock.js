/**
 * Instagram Reply Assist — Mock AI Module
 * 
 * PURPOSE: Local testing without an Anthropic API key.
 * REMOVAL: Delete this file and remove the importScripts("mock.js") 
 *          line from background.js when switching to real API.
 *
 * Exposes: MOCK_MODE (boolean), handleMockReply(messageText, brandData)
 */

/* ───────── Toggle ───────── */
// Set to false (or delete this file + importScripts line) for production
const MOCK_MODE = true;

/* ───────── Intent Classifier ───────── */

function mockClassifyIntent(message) {
  const msg = (message || "").toLowerCase();
  const rules = [
    { intent: "Complaint",    keywords: ["refund", "broken", "damaged", "wrong", "angry", "worst", "terrible", "hate", "disgusting", "horrible", "disappointed"] },
    { intent: "Order Issue",  keywords: ["order", "tracking", "shipped", "delivery", "missing", "late", "delayed", "lost", "package", "dispatch"] },
    { intent: "Pricing",      keywords: ["price", "cost", "discount", "coupon", "sale", "offer", "cheap", "expensive", "how much", "deal", "promo"] },
    { intent: "Compliment",   keywords: ["love", "amazing", "great", "awesome", "thank", "perfect", "best", "beautiful", "fantastic", "wonderful", "obsessed"] },
  ];

  for (const { intent, keywords } of rules) {
    if (keywords.some((kw) => msg.includes(kw))) return intent;
  }
  return "Inquiry";
}

/* ───────── Escalation Check ───────── */

function mockShouldEscalate(message, escalationKeywordsStr) {
  const msg = (message || "").toLowerCase();
  const defaults = ["refund", "lawsuit", "legal", "lawyer", "scam", "fraud", "police", "sue", "report you"];
  const custom = escalationKeywordsStr
    ? escalationKeywordsStr.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean)
    : [];
  const keywords = custom.length > 0 ? custom : defaults;
  return keywords.some((kw) => msg.includes(kw));
}

/* ───────── Mock Reply Generator ───────── */

/**
 * Generates a mock AI reply based on detected intent and brand data.
 * Returns the same shape as the real API handler: { intent, reply, escalate, escalationReason }
 */
function handleMockReply(messageText, brandData) {
  const brand = brandData.brandName || "Our Brand";
  const intent = mockClassifyIntent(messageText);

  // Escalation check
  if (mockShouldEscalate(messageText, brandData.escalationKeywords)) {
    return {
      intent: intent,
      reply: "",
      escalate: true,
      escalationReason: `Escalation keyword detected. Message type: ${intent}. Forward to brand owner — do not reply via extension.`,
    };
  }

  // Intent-based replies
  const replyTemplates = {
    Inquiry: [
      `Hey there! 👋 Thanks for reaching out to ${brand}! That's a great question. We'd be happy to help — could you share a few more details so we can give you the best answer? 😊`,
      `Hi! Thanks for messaging ${brand}! We're here to help. Let me look into that for you — I'll get back with the details shortly! ✨`,
      `Hello! Welcome to ${brand} 🎉 Great question! Let me check on that and get you the most accurate info. Hang tight!`,
    ],
    Complaint: [
      `Hi there, I'm really sorry to hear about your experience with ${brand} 😔 We take this very seriously and want to make it right. Could you share your order number so we can look into this immediately?`,
      `Oh no, that's not the experience we want you to have at ${brand}! 💛 Please send us your order details and we'll prioritize resolving this for you ASAP.`,
    ],
    Compliment: [
      `Aww, thank you SO much! 🥰 That truly means the world to the entire ${brand} team! We put a lot of love into everything we do, and hearing this makes our day! 💕`,
      `You just made our whole week! 😍 Thank you for the kind words — we're so glad you're loving ${brand}! You're the best! 🙌`,
    ],
    "Order Issue": [
      `Hi! Thanks for reaching out about your order 📦 I'd love to help sort this out! Could you share your order number or the email you used at checkout? I'll look into the status right away! 🙏`,
      `Hey! Sorry about the hassle with your order from ${brand}. Let me check on that — drop your order # below and I'll get you an update ASAP! 💪`,
    ],
    Pricing: [
      `Hey! Great question about pricing! 💰 ${brandData.productCatalogue ? "Here's what we currently have:\n" + brandData.productCatalogue.split("\n").slice(0, 3).join("\n") : `Check out ${brand}'s latest products on our page!`} \nLet me know which item caught your eye! 🛍️`,
      `Hi there! Thanks for your interest in ${brand}! 🎉 Our prices vary by product and we often have special deals running. Which item are you looking at? I'll get you the latest pricing! 💫`,
    ],
  };

  const templates = replyTemplates[intent] || replyTemplates["Inquiry"];
  const reply = templates[Math.floor(Math.random() * templates.length)];

  return {
    intent: intent,
    reply: reply,
    escalate: false,
    escalationReason: null,
  };
}
