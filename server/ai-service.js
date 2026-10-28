import "./config.js";
import https from "node:https";
import OpenAI from "openai";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import rateLimit from "express-rate-limit";

export const httpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 50 });

export const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });

export const aiProvider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : "openai")).trim().toLowerCase();
if (!["openai", "gemini"].includes(aiProvider)) {
  throw new Error("AI_PROVIDER must be 'openai' or 'gemini'.");
}

export const aiApiKey = aiProvider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;

export const aiModel = process.env.AI_MODEL || (aiProvider === "gemini"
  ? process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
  : process.env.OPENAI_MODEL || "gpt-4o-mini");

export const aiClient = aiApiKey ? new OpenAI({
  apiKey: aiApiKey,
  httpAgent: httpsAgent,
  ...(aiProvider === "gemini" ? { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" } : {}),
}) : null;

export const createTasksTool = {
  type: "function",
  function: {
    name: "add_tasks_to_daylight",
    description: "Add one or more action items to the user's Daylight task list. Use this ONLY when the user explicitly asks to add, create, or schedule tasks on their list.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "string",
            description: "A concise actionable task title between 1 and 140 characters.",
          },
          minItems: 1,
          maxItems: 8,
          description: "List of new tasks to add to Daylight.",
        },
      },
      required: ["tasks"],
      additionalProperties: false,
    },
  },
};

export const ALLOWED_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
];

export async function executeChatCompletion(params) {
  try {
    return await aiClient.chat.completions.create(params);
  } catch (err) {
    if (params.model === "gemini-3.1-flash-lite" && (err?.status === 503 || err?.message?.includes("high demand") || err?.status === 404)) {
      try {
        return await aiClient.chat.completions.create({ ...params, model: "gemini-3.1-flash-lite-preview" });
      } catch {
        return await aiClient.chat.completions.create({ ...params, model: "gemini-3.5-flash-lite" });
      }
    }
    throw err;
  }
}

export function renderAssistantMarkdown(text) {
  return sanitizeHtml(marked.parse(text, { breaks: true }), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "del", "h1", "h2", "h3", "hr", "table", "thead", "tbody", "tr", "th", "td"],
    allowedAttributes: { a: ["href", "name"] },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export function getInstantTitle(cleanMsg) {
  const msg = (cleanMsg || "").trim();
  if (/^y+o+(!*|\?*)$/i.test(msg) || /^let'?s\s*go+(!*|\?*)$/i.test(msg) || /^y+e+a+h+(!*|\?*)$/i.test(msg)) {
    return "Energetic Greeting Dialogue";
  }
  if (/^(hi+|hello+|hey+|howdy)(!*|\?*)$/i.test(msg)) {
    return "Friendly Greeting";
  }
  if (/^(sup|what'?s\s*up|wassup)(!*|\?*)$/i.test(msg)) {
    return "Casual Greeting Exchange";
  }
  if (/^(good\s*(morning|afternoon|evening|day))(!*|\?*)$/i.test(msg)) {
    return "Warm Greeting Dialogue";
  }
  if (/^(bruh|bro|dude)(!*|\?*)$/i.test(msg)) {
    return "Casual Expression Exchange";
  }
  if (/^(whoa|wow|omg|holy\s*cow)(!*|\?*)$/i.test(msg)) {
    return "Surprised Reaction Discussion";
  }
  if (/^(thanks|thank\s*you|thx)(!*|\?*)$/i.test(msg)) {
    return "Appreciative Conversation";
  }
  return null;
}

export function formatQuickTitle(msg) {
  let cleaned = (msg || "")
    .replace(/^(can you\s+(please\s+)?(tell|give|explain|help|show|write)\s+(me\s+)?(about\s+)?)/i, "")
    .replace(/^(i want to\s+(listen|hear|know|learn|see|get)\s+(some\s+)?)/i, "")
    .replace(/^(tell me\s+(about\s+)?)/i, "")
    .replace(/^(how (to|do i|can i)\s+)/i, "")
    .replace(/^(what (is|are)\s+)/i, "")
    .replace(/^(give me\s+(some\s+)?)/i, "")
    .replace(/^(help me\s+(with\s+)?)/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!cleaned) cleaned = (msg || "").slice(0, 30).trim();
  const words = cleaned.split(/\s+/).slice(0, 4);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") || "New Conversation";
}

export async function generateSmartTitle(userMsg, assistantReply) {
  const instant = getInstantTitle(userMsg);
  if (instant) return instant;
  if (!aiClient) return formatQuickTitle(userMsg);
  try {
    const res = await aiClient.chat.completions.create({
      model: aiModel,
      messages: [
        {
          role: "system",
          content: "You are the chat title generator. Output strictly a natural, 2-to-4 word title in Title Case describing the tone or topic. No punctuation or quotes."
        },
        {
          role: "user",
          content: `User: ${userMsg.slice(0, 140)}\nReply: ${(assistantReply || "").slice(0, 100)}`
        }
      ],
      max_tokens: 16,
      temperature: 0.4,
    });
    let generated = res.choices[0]?.message?.content?.trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/^Title:\s*/i, "")
      .replace(/[.!?]+$/g, "")
      .trim();

    if (generated && generated.length >= 2 && generated.length <= 40) {
      return generated;
    }
  } catch (err) {
    console.warn("Smart title refinement skipped:", err.message);
  }
  return formatQuickTitle(userMsg);
}
