import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireCsrf } from "../auth.js";
import {
  aiClient,
  aiProvider,
  aiModel,
  aiLimiter,
  ALLOWED_MODELS,
  executeChatCompletion,
  createTasksTool,
  renderAssistantMarkdown,
  getInstantTitle,
  formatQuickTitle,
  generateSmartTitle,
} from "../ai-service.js";
import { tasksForUser, addUserTask, validateTaskText } from "./tasks.routes.js";

const router = Router();

// Conversation List
router.get("/api/ai/conversations", requireAuth, (req, res) => {
  const conversations = db
    .prepare("SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50")
    .all(req.user.id);
  res.json({ conversations });
});

// Single Conversation Messages
router.get("/api/ai/conversations/:id", requireAuth, (req, res) => {
  const conversation = db
    .prepare("SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM ai_conversations WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  const messages = db
    .prepare("SELECT id, role, content, content_html AS contentHtml, created_at AS createdAt FROM ai_messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(conversation.id);
  res.json({ conversation, messages });
});

// Delete Conversation
router.delete("/api/ai/conversations/:id", requireAuth, requireCsrf, (req, res) => {
  const result = db.prepare("DELETE FROM ai_conversations WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "Conversation not found." });
  res.status(204).end();
});

// AI Chat Main Endpoint (Streaming & Non-Streaming)
router.post("/api/ai/chat", requireAuth, requireCsrf, aiLimiter, async (req, res, next) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 1000) {
    return res.status(400).json({ error: "Your message must be between 1 and 1,000 characters." });
  }
  if (!aiClient) {
    return res.status(503).json({
      error: `The AI assistant isn’t configured yet. Add ${aiProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} to the server’s .env file.`,
    });
  }

  let conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId.trim() : "";
  let conv = conversationId ? db.prepare("SELECT id, title FROM ai_conversations WHERE id = ? AND user_id = ?").get(conversationId, req.user.id) : null;
  const now = new Date().toISOString();
  let isNewConversation = false;

  if (!conv) {
    isNewConversation = true;
    const initialTitle = message.replace(/\s+/g, " ").slice(0, 32).trim() || "New conversation";
    const newId = randomBytes(16).toString("hex");
    db.prepare("INSERT INTO ai_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(newId, req.user.id, initialTitle, now, now);
    conv = { id: newId, title: initialTitle };
  } else {
    db.prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?").run(now, conv.id);
  }

  const replaceMessageId = req.body?.replaceMessageId ? Number(req.body.replaceMessageId) : null;
  if (replaceMessageId && conv) {
    db.prepare("DELETE FROM ai_messages WHERE conversation_id = ? AND id >= ?").run(conv.id, replaceMessageId);
  }

  // Save the user's message
  const userMsgInsert = db
    .prepare("INSERT INTO ai_messages (conversation_id, role, content, content_html, created_at) VALUES (?, 'user', ?, NULL, ?)")
    .run(conv.id, message, now);
  const userMessageId = Number(userMsgInsert.lastInsertRowid);

  const isFirstMessage = isNewConversation || db.prepare("SELECT COUNT(*) AS count FROM ai_messages WHERE conversation_id = ?").get(conv.id).count <= 1;

  // Fetch recent conversation history
  const previousHistory = db
    .prepare("SELECT role, content FROM ai_messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT 10")
    .all(conv.id, userMessageId)
    .reverse();

  const userTasks = tasksForUser(req.user.id);
  const activeTasks = userTasks.filter((t) => !t.completed);
  const taskContext =
    activeTasks.length > 0
      ? `The user currently has ${activeTasks.length} active tasks on their list:\n` +
        activeTasks
          .slice(0, 15)
          .map((t, idx) => `${idx + 1}. "${t.text}"${t.priority !== "none" ? ` [Priority: ${t.priority}]` : ""}${t.dueDate ? ` [Due: ${t.dueDate}]` : ""}`)
          .join("\n")
      : "The user has no tasks on their to-do list right now.";

  const requestedModel = typeof req.body?.model === "string" ? req.body.model.trim() : null;
  const currentModel = requestedModel && ALLOWED_MODELS.includes(requestedModel) ? requestedModel : aiModel;

  const wantStream = Boolean(req.body?.stream);

  if (wantStream) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      const stream = await executeChatCompletion({
        model: currentModel,
        messages: [
          {
            role: "system",
            content: `You are Daylight, an intuitive, intelligent, and thoughtful general-purpose AI assistant. Help with questions, explanations, brainstorming, writing, learning, everyday problem-solving, gaming tips, and planning.

INTUITIVE QUERY UNDERSTANDING:
- Users frequently write with minor typos, informal slang, inverted phrasing, abbreviations, or colloquial terms (for example, "Gaunlet of Asphalt" refers to Gauntlet mode in Gameloft's Asphalt racing series such as Asphalt 9: Legends / Asphalt Legends Unite or Asphalt 8; "Mine craft" = Minecraft; "gta 5" = Grand Theft Auto V).
- Always intelligently infer the intended meaning, forgive typos and inverted phrasing, and answer directly with comprehensive, practical, and well-structured guidance.
- Do NOT feign ignorance, stall, or ask clarifying questions when the context points to a well-known game, topic, hobby, technology, or event. Answer the most probable subject directly and gracefully (e.g., "In the Asphalt series (Asphalt 9 / Asphalt Legends Unite), the **Gauntlet** mode is...").

CURRENT USER TASKS:
${taskContext}

- You can answer questions about general topics, games, coding, writing, problem-solving, or their tasks.
- Only add items to the user's Daylight task list when they explicitly ask you to add or create tasks there; suggesting or discussing a plan is not permission. When explicitly asked, call add_tasks_to_daylight with concise actionable task titles. Do not claim to change the list except through the tool. Never request passwords, access tokens, or sensitive personal information.`,
          },
          ...previousHistory,
          { role: "user", content: message },
        ],
        tools: [createTasksTool],
        tool_choice: "auto",
        parallel_tool_calls: false,
        max_tokens: 2500,
        stream: true,
      });

      let accumulatedContent = "";
      const toolCallsAcc = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          accumulatedContent += delta.content;
          res.write(`data: ${JSON.stringify({ type: "chunk", text: delta.content })}\n\n`);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index || 0;
            if (!toolCallsAcc[idx]) {
              toolCallsAcc[idx] = { id: tc.id || "", function: { name: tc.function?.name || "", arguments: "" } };
            }
            if (tc.id) toolCallsAcc[idx].id = tc.id;
            if (tc.function?.name) toolCallsAcc[idx].function.name = tc.function.name;
            if (tc.function?.arguments) toolCallsAcc[idx].function.arguments += tc.function.arguments;
          }
        }
      }

      let addedTasks = [];
      let reply = accumulatedContent;
      let replyHtml = "";
      const taskToolCall = toolCallsAcc.find((c) => c.function?.name === "add_tasks_to_daylight");

      if (taskToolCall) {
        let requested;
        try {
          requested = JSON.parse(taskToolCall.function.arguments).tasks;
        } catch {
          res.write(`data: ${JSON.stringify({ type: "error", error: "The assistant returned an invalid task plan. Please try again." })}\n\n`);
          return res.end();
        }
        if (!Array.isArray(requested) || requested.length < 1 || requested.length > 8 || requested.some((item) => !validateTaskText(item))) {
          res.write(`data: ${JSON.stringify({ type: "error", error: "The assistant returned tasks that could not be validated. Please try again." })}\n\n`);
          return res.end();
        }
        const insertTasks = db.transaction((items) => items.map((item) => addUserTask(req.user.id, validateTaskText(item))));
        addedTasks = insertTasks(requested);

        const followUp = await executeChatCompletion({
          model: currentModel,
          messages: [
            { role: "system", content: "You are Daylight, a concise planning assistant. Confirm the tasks were added and briefly encourage the user." },
            { role: "user", content: message },
            { role: "assistant", tool_calls: [taskToolCall] },
            { role: "tool", tool_call_id: taskToolCall.id, content: JSON.stringify({ added: addedTasks.map((task) => task.text) }) },
          ],
          max_tokens: 250,
        });
        reply = followUp.choices[0]?.message?.content || "Done — I added those tasks to your list.";
        replyHtml = renderAssistantMarkdown(reply);
      } else {
        reply = reply || "What would you like to focus on?";
        replyHtml = renderAssistantMarkdown(reply);
      }

      const replyNow = new Date().toISOString();
      const assistantMsgInsert = db
        .prepare("INSERT INTO ai_messages (conversation_id, role, content, content_html, created_at) VALUES (?, 'assistant', ?, ?, ?)")
        .run(conv.id, reply, replyHtml, replyNow);
      const assistantMessageId = Number(assistantMsgInsert.lastInsertRowid);

      let finalTitle = conv.title;
      if (isFirstMessage) {
        const instant = getInstantTitle(message);
        finalTitle = instant || formatQuickTitle(message);
        db.prepare("UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?").run(finalTitle, replyNow, conv.id);

        if (!instant) {
          generateSmartTitle(message, reply)
            .then((refined) => {
              if (refined && refined !== finalTitle) {
                db.prepare("UPDATE ai_conversations SET title = ? WHERE id = ?").run(refined, conv.id);
              }
            })
            .catch((err) => console.warn("Background title refinement skipped:", err.message));
        }
      } else {
        db.prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?").run(replyNow, conv.id);
      }

      res.write(
        `data: ${JSON.stringify({
          type: "done",
          reply,
          replyHtml,
          addedTasks,
          conversationId: conv.id,
          title: finalTitle,
          isNewTitle: Boolean(isFirstMessage),
          userMessageId,
          assistantMessageId,
        })}\n\n`
      );
      res.end();
    } catch (error) {
      console.error("Streaming AI error:", error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message || "Something went wrong." })}\n\n`);
      res.end();
    }
    return;
  }

  try {
    const response = await executeChatCompletion({
      model: currentModel,
      messages: [
        {
          role: "system",
          content: `You are Daylight, an intuitive, intelligent, and thoughtful general-purpose AI assistant. Help with questions, explanations, brainstorming, writing, learning, everyday problem-solving, gaming tips, and planning.

INTUITIVE QUERY UNDERSTANDING:
- Users frequently write with minor typos, informal slang, inverted phrasing, abbreviations, or colloquial terms (for example, "Gaunlet of Asphalt" refers to Gauntlet mode in Gameloft's Asphalt racing series such as Asphalt 9: Legends / Asphalt Legends Unite or Asphalt 8; "Mine craft" = Minecraft; "gta 5" = Grand Theft Auto V).
- Always intelligently infer the intended meaning, forgive typos and inverted phrasing, and answer directly with comprehensive, practical, and well-structured guidance.
- Do NOT feign ignorance, stall, or ask clarifying questions when the context points to a well-known game, topic, hobby, technology, or event. Answer the most probable subject directly and gracefully (e.g., "In the Asphalt series (Asphalt 9 / Asphalt Legends Unite), the **Gauntlet** mode is...").

CURRENT USER TASKS:
${taskContext}

- You can answer questions about general topics, games, coding, writing, problem-solving, or their tasks.
- Only add items to the user's Daylight task list when they explicitly ask you to add or create tasks there; suggesting or discussing a plan is not permission. When explicitly asked, call add_tasks_to_daylight with concise actionable task titles. Do not claim to change the list except through the tool. Never request passwords, access tokens, or sensitive personal information.`,
        },
        ...previousHistory,
        { role: "user", content: message },
      ],
      tools: [createTasksTool],
      tool_choice: "auto",
      parallel_tool_calls: false,
      max_tokens: 2500,
    });

    const assistantMessage = response.choices[0]?.message;
    let addedTasks = [];
    const toolCall = assistantMessage?.tool_calls?.find((call) => call.function.name === "add_tasks_to_daylight");
    let reply = "";
    let replyHtml = "";

    if (toolCall) {
      let requested;
      try {
        requested = JSON.parse(toolCall.function.arguments).tasks;
      } catch {
        return res.status(502).json({ error: "The assistant returned an invalid task plan. Please try again." });
      }
      if (!Array.isArray(requested) || requested.length < 1 || requested.length > 8 || requested.some((item) => !validateTaskText(item))) {
        return res.status(502).json({ error: "The assistant returned tasks that could not be validated. Please try again." });
      }
      const insertTasks = db.transaction((items) => items.map((item) => addUserTask(req.user.id, validateTaskText(item))));
      addedTasks = insertTasks(requested);
      const followUp = await executeChatCompletion({
        model: currentModel,
        messages: [
          { role: "system", content: "You are Daylight, a concise planning assistant. Confirm the tasks were added and briefly encourage the user." },
          { role: "user", content: message },
          assistantMessage,
          { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ added: addedTasks.map((task) => task.text) }) },
        ],
        max_tokens: 250,
      });
      reply = followUp.choices[0]?.message?.content || "Done — I added those tasks to your list.";
      replyHtml = renderAssistantMarkdown(reply);
    } else {
      reply = assistantMessage?.content || "What would you like to focus on?";
      replyHtml = renderAssistantMarkdown(reply);
    }

    const replyNow = new Date().toISOString();
    const assistantMsgInsert = db
      .prepare("INSERT INTO ai_messages (conversation_id, role, content, content_html, created_at) VALUES (?, 'assistant', ?, ?, ?)")
      .run(conv.id, reply, replyHtml, replyNow);
    const assistantMessageId = Number(assistantMsgInsert.lastInsertRowid);

    let finalTitle = conv.title;
    if (isFirstMessage) {
      const instant = getInstantTitle(message);
      finalTitle = instant || formatQuickTitle(message);
      db.prepare("UPDATE ai_conversations SET title = ?, updated_at = ? WHERE id = ?").run(finalTitle, replyNow, conv.id);

      if (!instant) {
        generateSmartTitle(message, reply)
          .then((refined) => {
            if (refined && refined !== finalTitle) {
              db.prepare("UPDATE ai_conversations SET title = ? WHERE id = ?").run(refined, conv.id);
            }
          })
          .catch((err) => console.warn("Background title refinement skipped:", err.message));
      }
    } else {
      db.prepare("UPDATE ai_conversations SET updated_at = ? WHERE id = ?").run(replyNow, conv.id);
    }

    res.json({
      reply,
      replyHtml,
      addedTasks,
      conversationId: conv.id,
      title: finalTitle,
      isNewTitle: Boolean(isFirstMessage),
      userMessageId,
      assistantMessageId,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    res.status(500).json({ error: error.message || "Something went wrong while contacting Daylight AI." });
  }
});

// Audio Transcription (Universal microphone support for Brave, Chrome, Safari, Edge)
const TRANSCRIPTION_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest"
];

router.post("/api/ai/transcribe", requireAuth, requireCsrf, async (req, res) => {
  try {
    const { audio, mimeType = "audio/webm" } = req.body;
    if (!audio) {
      return res.status(400).json({ error: "No audio data provided." });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Gemini API key is required for transcription." });
    }

    const cleanMimeType = (mimeType || "audio/webm").split(";")[0].trim();
    const base64Data = audio.includes(",") ? audio.split(",")[1].trim() : audio.trim();

    let lastError = null;

    for (const model of TRANSCRIPTION_MODELS) {
      try {
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "You are an expert speech-to-text dictation transcriber. Transcribe the spoken English words from the audio verbatim into clean text. Note: The audio may be recorded from a quiet headset, AirPods, or laptop microphone—listen carefully and amplify your attention to faint or quiet human speech.\nSTRICT RULES:\n- Output ONLY the spoken words (e.g. 'Hello', 'What are you doing', 'Add buy milk to my list').\n- NEVER output timestamps, durations, or time codes (such as '00:00', '00:01', '0:01', '[00:01]').\n- NEVER output commentary, explanations, or formatting.\n- If there is absolutely no human voice at all, output: NO_SPEECH." },
                { inline_data: { mime_type: cleanMimeType, data: base64Data } }
              ]
            }],
            generationConfig: {
              maxOutputTokens: 250,
              temperature: 0
            }
          })
        });

        const data = await geminiRes.json();
        if (data.error) {
          lastError = data.error;
          console.warn(`Transcription warning on ${model}:`, data.error.message || data.error);
          continue; // Try next fallback model
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        let transcribed = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join(" ").trim()
          || parts[0]?.text?.trim()
          || "";

        // Filter out any timestamps or timecode artifacts (e.g. 00:01, [00:00], etc.)
        transcribed = transcribed.replace(/\[?\b\d{1,2}:\d{2}(?::\d{2})?\b\]?/g, "").trim();

        // If model output NO_SPEECH, normalize to empty
        if (transcribed.toUpperCase() === "NO_SPEECH" || transcribed.toUpperCase() === "NO_SPEECH." || transcribed.toUpperCase() === "EMPTY") {
          transcribed = "";
        }

        // Clean any quotation marks that Gemini might wrap around the transcribed speech
        if ((transcribed.startsWith('"') && transcribed.endsWith('"')) || (transcribed.startsWith("'") && transcribed.endsWith("'"))) {
          if (transcribed.length > 2) {
            transcribed = transcribed.slice(1, -1).trim();
          }
        }

        console.log(`[Audio Transcribe] Model: ${model} -> Result: "${transcribed}"`);
        return res.json({ text: transcribed, modelUsed: model });
      } catch (err) {
        lastError = err;
        console.warn(`Transcription request failed on ${model}:`, err.message);
      }
    }

    // If all models failed
    const errorMsg = lastError?.message || "All transcription models are currently unavailable.";
    return res.status(502).json({ error: errorMsg });
  } catch (err) {
    console.error("Transcription router error:", err);
    res.status(500).json({ error: err.message || "Could not process audio." });
  }
});

export default router;
