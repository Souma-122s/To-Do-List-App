/**
 * Daylight AI Chat - Main Controller
 * Orchestrates chat canvas, streaming responses, conversation history, and tool integration.
 */

const form = document.querySelector("#ai-chat-form");
const input = document.querySelector("#ai-chat-input");
const messages = document.querySelector("#ai-chat-messages");
const sendButton = document.querySelector("#ai-send-btn");
const toast = document.querySelector("#ai-toast");
const historyList = document.querySelector("#ai-history-list");
const historyCount = document.querySelector("#history-count");
const newChatBtn = document.querySelector("#new-chat-btn");
const historyToggle = document.querySelector("#ai-history-toggle");
const historySidebar = document.querySelector("#ai-history-sidebar");
const heroWrap = document.querySelector("#ai-hero-wrap");
const heroTitle = document.querySelector("#ai-hero-title");
const promptSuggestions = document.querySelector("#ai-prompt-suggestions");

let currentConversationId = null;
let conversations = [];
let busy = false;
let csrfToken = "";
let activeTypewriterTimer = null;
let animateTitleId = null;

const RANDOM_TITLES = [
  "What’s on your mind today?",
  "What do you want to accomplish today?",
  "Ready to tackle what matters today?",
  "What tasks are we conquering today?",
  "Let’s plan your day. Where should we start?",
  "Clear your mind. What’s next on your to-do list?",
  "What would you like to achieve today?",
  "How can Daylight help you focus today?",
  "Let’s turn your to-do list into done.",
  "What’s the most important task right now?",
  "Organize your thoughts. What’s on your list?",
  "Ready to make today productive?",
];

function setRandomHeroTitle() {
  if (!heroTitle) return;
  const current = heroTitle.textContent;
  const pool = RANDOM_TITLES.filter((t) => t !== current);
  const picked = pool[Math.floor(Math.random() * pool.length)] || RANDOM_TITLES[0];
  heroTitle.textContent = picked;
}

function setChatViewMode(isNewChat) {
  const card = document.querySelector(".ai-chat-card");
  if (!card) return;

  if (isNewChat) {
    card.classList.add("is-new-chat");
    if (heroWrap) heroWrap.style.display = "block";
    if (promptSuggestions) promptSuggestions.style.display = "flex";
    setRandomHeroTitle();
  } else {
    card.classList.remove("is-new-chat");
    if (heroWrap) heroWrap.style.display = "none";
    if (promptSuggestions) promptSuggestions.style.display = "none";
  }
}

function typeWriterEffect(element, fullText, speed = 34) {
  if (!element || !fullText) return;
  if (activeTypewriterTimer) {
    clearInterval(activeTypewriterTimer);
    activeTypewriterTimer = null;
  }
  element.textContent = "";
  element.title = fullText;
  let charIndex = 0;

  activeTypewriterTimer = setInterval(() => {
    charIndex++;
    element.textContent = fullText.slice(0, charIndex);
    if (charIndex >= fullText.length) {
      clearInterval(activeTypewriterTimer);
      activeTypewriterTimer = null;
      animateTitleId = null;
    }
  }, speed);
}

let toastTimer = null;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...(options.headers || {}),
    },
    credentials: "same-origin",
  });
  if (!response.ok) {
    let err = {};
    try { err = await response.json(); } catch {}
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function addMessage(role, text, { typing = false, html = "", id = null } = {}) {
  const message = document.createElement("article");
  message.className = `chat-message ${role}-message`;
  if (id) message.dataset.messageId = id;
  message.dataset.role = role;
  message.dataset.rawText = text;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar ai-assistant-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML = `<span class="avatar-spark">✳</span>`;
    message.append(avatar);
  }

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "chat-bubble-wrap";

  const content = document.createElement("div");
  content.className = "chat-message-content";

  if (html) {
    content.innerHTML = html;
  } else {
    const p = document.createElement("p");
    p.textContent = text;
    content.append(p);
  }

  bubbleWrap.append(content);

  if (!typing) {
    const actions = createMessageActions(role, text, message, content);
    bubbleWrap.append(actions);
  }

  message.append(bubbleWrap);
  if (typing) message.classList.add("chat-typing");
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

const ICONS = {
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  share: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  speaker: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>'
};

function createMessageActions(role, initialText, messageElement, contentElement) {
  const actions = document.createElement("div");
  actions.className = "chat-actions";

  if (role === "user") {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "chat-action-btn edit-btn";
    editBtn.title = "Edit message";
    editBtn.setAttribute("aria-label", "Edit message");
    editBtn.innerHTML = ICONS.edit;
    editBtn.addEventListener("click", () => enterEditMode(messageElement, contentElement, actions));
    actions.append(editBtn);
  }

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "chat-action-btn copy-btn";
  copyBtn.title = "Copy text";
  copyBtn.setAttribute("aria-label", "Copy text to clipboard");
  copyBtn.innerHTML = ICONS.copy;
  copyBtn.addEventListener("click", async () => {
    const textToCopy = messageElement.dataset.rawText || contentElement.innerText.trim();
    try {
      await navigator.clipboard.writeText(textToCopy);
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = ICONS.check;
      copyBtn.title = "Copied!";
      showToast("Copied to clipboard!");
      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = ICONS.copy;
        copyBtn.title = "Copy text";
      }, 1800);
    } catch {
      showToast("Unable to copy to clipboard.");
    }
  });
  actions.append(copyBtn);

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "chat-action-btn share-btn";
  shareBtn.title = role === "user" ? "Share prompt" : "Share response";
  shareBtn.setAttribute("aria-label", role === "user" ? "Share prompt" : "Share response");
  shareBtn.innerHTML = ICONS.share;
  shareBtn.addEventListener("click", async () => {
    const rawText = messageElement.dataset.rawText || contentElement.innerText.trim();
    const sharePayload = role === "user"
      ? `"${rawText}" — Daylight AI Prompt`
      : `Daylight AI:\n\n${rawText}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Daylight AI",
          text: sharePayload,
        });
        showToast("Shared successfully!");
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(sharePayload);
      shareBtn.classList.add("shared");
      shareBtn.innerHTML = ICONS.check;
      shareBtn.title = "Shared!";
      showToast("Prompt copied to share! 🔗");
      setTimeout(() => {
        shareBtn.classList.remove("shared");
        shareBtn.innerHTML = ICONS.share;
        shareBtn.title = role === "user" ? "Share prompt" : "Share response";
      }, 1800);
    } catch {
      showToast("Could not share prompt.");
    }
  });
  actions.append(shareBtn);

  if (role === "assistant") {
    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "chat-action-btn speak-btn";
    speakBtn.title = "Read aloud";
    speakBtn.setAttribute("aria-label", "Read message aloud");
    speakBtn.innerHTML = ICONS.speaker;
    speakBtn.addEventListener("click", () => {
      const textToSpeak = messageElement.dataset.rawText || contentElement.innerText.trim();
      if (window.DaylightVoice) {
        window.DaylightVoice.toggleReadAloud(textToSpeak, speakBtn, showToast);
      }
    });
    actions.append(speakBtn);
  }

  return actions;
}

function enterEditMode(messageElement, contentElement, actionsElement) {
  if (busy) {
    showToast("Please wait until Daylight finishes thinking.");
    return;
  }
  const currentRaw = messageElement.dataset.rawText || contentElement.innerText.trim();
  const originalDisplay = contentElement.style.display;
  contentElement.style.display = "none";
  actionsElement.style.display = "none";

  const editBox = document.createElement("div");
  editBox.className = "chat-edit-box";

  const textarea = document.createElement("textarea");
  textarea.className = "chat-edit-input";
  textarea.value = currentRaw;
  textarea.rows = Math.min(6, Math.max(2, currentRaw.split("\n").length + 1));

  const editButtons = document.createElement("div");
  editButtons.className = "chat-edit-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "chat-edit-cancel";
  cancelBtn.textContent = "Cancel";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "chat-edit-save";
  saveBtn.textContent = "Send";

  editButtons.append(cancelBtn, saveBtn);
  editBox.append(textarea, editButtons);

  const bubbleWrap = messageElement.querySelector(".chat-bubble-wrap");
  bubbleWrap.append(editBox);

  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  function cleanup() {
    editBox.remove();
    contentElement.style.display = originalDisplay;
    actionsElement.style.display = "flex";
  }

  cancelBtn.addEventListener("click", cleanup);

  saveBtn.addEventListener("click", async () => {
    const updated = textarea.value.trim();
    if (!updated) {
      showToast("Message cannot be empty.");
      return;
    }
    cleanup();
    if (updated === currentRaw) return;

    let nextNode = messageElement.nextElementSibling;
    while (nextNode) {
      const toRemove = nextNode;
      nextNode = nextNode.nextElementSibling;
      toRemove.remove();
    }
    messageElement.remove();

    await sendEditedMessage(updated, messageElement.dataset.messageId || null);
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveBtn.click();
    } else if (e.key === "Escape") {
      cleanup();
    }
  });
}

function startThinkingIndicator() {
  const message = document.createElement("article");
  message.className = "chat-message assistant-message chat-typing";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar ai-assistant-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.innerHTML = `<span class="avatar-spark">✳</span>`;
  message.append(avatar);

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "chat-bubble-wrap";

  const content = document.createElement("div");
  content.className = "chat-message-content daylight-thinking-box";
  content.innerHTML = `
    <div class="daylight-thinking-wrap" aria-label="Daylight is thinking">
      <span class="daylight-thinking-mark" aria-hidden="true">✳</span>
      <span class="daylight-thinking-dots">
        <span></span><span></span><span></span>
      </span>
    </div>
  `;

  bubbleWrap.append(content);
  message.append(bubbleWrap);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function renderAddedTasksCard(addedTasks, container) {
  if (!Array.isArray(addedTasks) || addedTasks.length === 0) return;
  const card = document.createElement("div");
  card.className = "ai-added-tasks-card";

  const header = document.createElement("div");
  header.className = "ai-added-header";
  header.innerHTML = `<span>✓</span><strong>Added ${addedTasks.length} task${addedTasks.length > 1 ? "s" : ""} to Daylight</strong>`;

  const list = document.createElement("ul");
  list.className = "ai-added-list";
  for (const t of addedTasks) {
    const li = document.createElement("li");
    li.textContent = t.text || t;
    list.append(li);
  }

  card.append(header, list);
  container.append(card);
}

async function streamAiResponse(payload, { userMsgElement = null, wasNewChat = false } = {}) {
  const typingIndicator = startThinkingIndicator();
  busy = true;
  input.disabled = true;
  if (sendButton) sendButton.disabled = true;
  form.setAttribute("aria-busy", "true");

  const selectedModel = window.DaylightModels ? window.DaylightModels.getCurrentModel() : "gemini-3.8-flash";

  try {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {})
      },
      credentials: "same-origin",
      body: JSON.stringify({ ...payload, model: selectedModel, stream: true }),
    });

    if (!response.ok) {
      let errData = {};
      try { errData = await response.json(); } catch {}
      throw new Error(errData.error || `Error: ${response.status}`);
    }

    let assistantMsg = null;
    let contentDiv = null;
    let accumulatedText = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evText of events) {
        if (!evText.startsWith("data: ")) continue;
        const dataJson = evText.replace(/^data:\s*/, "");
        let data = {};
        try {
          data = JSON.parse(dataJson);
        } catch {
          continue;
        }

        if (data.type === "meta") {
          currentConversationId = data.conversationId;
          if (wasNewChat) {
            animateTitleId = data.conversationId;
            loadConversations();
          }
        } else if (data.type === "chunk") {
          if (!assistantMsg) {
            typingIndicator.remove();
            assistantMsg = addMessage("assistant", "", { typing: false });
            contentDiv = assistantMsg.querySelector(".chat-message-content");
            contentDiv.textContent = "";
          }
          accumulatedText += data.text;
          contentDiv.textContent = accumulatedText;
          messages.scrollTop = messages.scrollHeight;
        } else if (data.type === "final" || data.type === "done") {
          const finalContent = data.content || data.reply || accumulatedText;
          const finalHtml = data.contentHtml || data.replyHtml;
          if (data.conversationId) {
            currentConversationId = data.conversationId;
          }

          if (!assistantMsg) {
            typingIndicator.remove();
            assistantMsg = addMessage("assistant", "", { typing: false });
            contentDiv = assistantMsg.querySelector(".chat-message-content");
          }
          if (finalHtml) {
            contentDiv.innerHTML = finalHtml;
          } else {
            contentDiv.textContent = finalContent;
          }
          assistantMsg.dataset.rawText = finalContent;
          assistantMsg.dataset.messageId = data.assistantMessageId || data.messageId || "";

          if (Array.isArray(data.addedTasks) && data.addedTasks.length > 0) {
            renderAddedTasksCard(data.addedTasks, contentDiv);
          }

          const existingActions = assistantMsg.querySelector(".chat-actions");
          if (existingActions) existingActions.remove();
          const actions = createMessageActions("assistant", finalContent, assistantMsg, contentDiv);
          assistantMsg.querySelector(".chat-bubble-wrap").append(actions);
          messages.scrollTop = messages.scrollHeight;

          // Ensure conversation list in sidebar is refreshed with the latest title
          if (data.title && wasNewChat) {
            animateTitleId = currentConversationId;
          }
          loadConversations();
        } else if (data.type === "error") {
          throw new Error(data.error);
        }
      }
    }

    if (!assistantMsg) {
      typingIndicator.remove();
      addMessage("assistant", "No response received.");
    }
  } catch (err) {
    typingIndicator.remove();
    addMessage("assistant", `Sorry, I encountered an error: ${err.message}`);
    showToast(err.message);
  } finally {
    busy = false;
    input.disabled = false;
    if (sendButton) sendButton.disabled = false;
    form.removeAttribute("aria-busy");
    input.focus();
    updateSendButtonState();
  }
}

async function sendEditedMessage(text, replaceMessageId) {
  setChatViewMode(false);
  const userMsg = addMessage("user", text);
  await streamAiResponse(
    { message: text, conversationId: currentConversationId, replaceMessageId },
    { userMsgElement: userMsg, wasNewChat: false }
  );
}

function createHistoryItem(conv) {
  const item = document.createElement("div");
  item.className = "ai-history-item" + (conv.isPinned ? " is-pinned" : "");
  if (conv.id === currentConversationId) item.classList.add("active");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ai-history-btn";
  btn.setAttribute("aria-label", `Open chat: ${conv.title || "New Chat"}`);

  if (conv.isPinned) {
    const pinBadge = document.createElement("span");
    pinBadge.className = "ai-history-pin-badge";
    pinBadge.setAttribute("aria-label", "Pinned chat");
    pinBadge.title = "Pinned chat";
    pinBadge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M12 17v5" stroke-width="2.5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1z"/></svg>`;
    btn.append(pinBadge);
  }

  const titleSpan = document.createElement("span");
  titleSpan.className = "ai-history-title";

  if (animateTitleId === conv.id) {
    typeWriterEffect(titleSpan, conv.title || "New Chat");
  } else {
    titleSpan.textContent = conv.title || "New Chat";
    titleSpan.title = conv.title || "New Chat";
  }

  btn.append(titleSpan);
  btn.addEventListener("click", () => selectConversation(conv.id));

  const actions = document.createElement("div");
  actions.className = "ai-history-actions";

  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "ai-history-pin-btn" + (conv.isPinned ? " is-pinned" : "");
  pinBtn.title = conv.isPinned ? "Unpin chat" : "Pin chat to top";
  pinBtn.setAttribute("aria-label", conv.isPinned ? "Unpin chat" : "Pin chat to top");
  pinBtn.innerHTML = conv.isPinned
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M12 17v5" stroke-width="2.5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1z"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1z"/></svg>`;
  pinBtn.addEventListener("click", (e) => togglePinConversation(conv.id, e));

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "ai-history-delete-btn";
  delBtn.title = "Delete chat";
  delBtn.setAttribute("aria-label", "Delete chat");
  delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
  delBtn.addEventListener("click", (e) => promptDeleteConversation(conv.id, e));

  actions.append(pinBtn, delBtn);
  item.append(btn, actions);
  return item;
}

function renderConversationList() {
  if (!historyList) return;
  historyList.replaceChildren();

  // Sort: pinned first, then newest updated_at first
  conversations.sort((a, b) => {
    if (Boolean(b.isPinned) !== Boolean(a.isPinned)) {
      return b.isPinned ? 1 : -1;
    }
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  if (historyCount) {
    historyCount.textContent = conversations.length ? String(conversations.length) : "";
  }

  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ai-history-empty";
    empty.textContent = "No chats yet";
    historyList.append(empty);
    return;
  }

  const pinnedList = conversations.filter((c) => c.isPinned);
  const recentList = conversations.filter((c) => !c.isPinned);

  if (pinnedList.length > 0) {
    const pinnedHeader = document.createElement("div");
    pinnedHeader.className = "ai-history-group-header";
    pinnedHeader.innerHTML = `<span>📌 PINNED</span><span class="ai-history-group-count">${pinnedList.length}</span>`;
    historyList.append(pinnedHeader);

    for (const conv of pinnedList) {
      historyList.append(createHistoryItem(conv));
    }

    if (recentList.length > 0) {
      const recentHeader = document.createElement("div");
      recentHeader.className = "ai-history-group-header recent";
      recentHeader.innerHTML = `<span>RECENT</span><span class="ai-history-group-count">${recentList.length}</span>`;
      historyList.append(recentHeader);
    }
  }

  for (const conv of recentList) {
    historyList.append(createHistoryItem(conv));
  }
}

async function togglePinConversation(id, event) {
  event?.stopPropagation();
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  const previousState = conv.isPinned;
  // Optimistic UI update
  conv.isPinned = !previousState;
  renderConversationList();

  try {
    const res = await api(`/api/ai/conversations/${encodeURIComponent(id)}/pin`, {
      method: "PATCH",
    });
    conv.isPinned = Boolean(res.isPinned);
    renderConversationList();
    showToast(conv.isPinned ? "Chat pinned to top 📌" : "Chat unpinned");
  } catch (err) {
    conv.isPinned = previousState;
    renderConversationList();
    showToast(err.message || "Could not update pin state");
  }
}

async function loadConversations() {
  try {
    const result = await api("/api/ai/conversations");
    const rawList = Array.isArray(result) ? result : (result?.conversations || []);
    conversations = rawList.map((c) => ({
      ...c,
      isPinned: Boolean(c.isPinned ?? c.is_pinned),
    }));
    renderConversationList();
  } catch (err) {
    console.error("Failed to load conversations:", err);
  }
}

async function selectConversation(id) {
  if (busy || currentConversationId === id) return;
  try {
    const result = await api(`/api/ai/conversations/${encodeURIComponent(id)}`);
    currentConversationId = id;
    renderConversationList();

    setChatViewMode(false);
    messages.replaceChildren();

    if (Array.isArray(result.messages) && result.messages.length > 0) {
      for (const msg of result.messages) {
        addMessage(msg.role, msg.content, { html: msg.contentHtml || "", id: msg.id });
      }
    } else {
      addMessage("assistant", "Empty conversation. Send a message to continue!");
    }

    historySidebar?.classList.remove("open");
    input.focus();
  } catch (err) {
    showToast(err.message);
  }
}

function startNewChat() {
  if (busy) return;
  if (activeTypewriterTimer) {
    clearInterval(activeTypewriterTimer);
    activeTypewriterTimer = null;
  }
  currentConversationId = null;
  animateTitleId = null;
  renderConversationList();

  messages.replaceChildren();
  setChatViewMode(true);

  historySidebar?.classList.remove("open");
  input.focus();
}

let pendingDeleteId = null;

function promptDeleteConversation(id, event) {
  event?.stopPropagation?.();
  pendingDeleteId = id;
  const modal = document.querySelector("#delete-modal");
  if (modal) {
    modal.hidden = false;
    document.querySelector("#modal-cancel-btn")?.focus();
  }
}

async function confirmDeleteConversation() {
  const modal = document.querySelector("#delete-modal");
  if (modal) modal.hidden = true;
  if (!pendingDeleteId) return;

  const idToDelete = pendingDeleteId;
  pendingDeleteId = null;

  try {
    await api(`/api/ai/conversations/${encodeURIComponent(idToDelete)}`, { method: "DELETE" });
    if (currentConversationId === idToDelete) {
      startNewChat();
    }
    await loadConversations();
    showToast("Conversation deleted.");
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes("not found")) {
      conversations = conversations.filter((c) => c.id !== idToDelete);
      renderConversationList();
      if (currentConversationId === idToDelete) {
        startNewChat();
      }
      showToast("Conversation deleted.");
    } else {
      showToast(err.message);
    }
  }
}

function closeDeleteModal() {
  pendingDeleteId = null;
  const modal = document.querySelector("#delete-modal");
  if (modal) modal.hidden = true;
}

async function sendMessage(text) {
  if (!text || busy) return;
  const wasNewChat = !currentConversationId;
  setChatViewMode(false);
  const userMsg = addMessage("user", text);
  await streamAiResponse(
    { message: text, conversationId: currentConversationId },
    { userMsgElement: userMsg, wasNewChat }
  );
}

function updateSendButtonState() {
  if (sendButton) {
    const hasText = Boolean(input.value.trim());
    sendButton.disabled = busy || !hasText;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = "";
  input.style.height = "auto";
  updateSendButtonState();
  sendMessage(text);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
  updateSendButtonState();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-ai-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.aiPrompt;
    form.requestSubmit();
  });
});

newChatBtn?.addEventListener("click", () => startNewChat());

document.querySelector("#modal-cancel-btn")?.addEventListener("click", closeDeleteModal);
document.querySelector("#modal-confirm-btn")?.addEventListener("click", confirmDeleteConversation);
document.querySelector("#delete-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "delete-modal") closeDeleteModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeDeleteModal();
  }
});

// Sidebar Toggling
historyToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (window.innerWidth <= 860) {
    historySidebar?.classList.toggle("open");
  } else {
    historySidebar?.classList.toggle("sidebar-collapsed");
  }
});

document.querySelector("#ai-sidebar-close-btn")?.addEventListener("click", () => {
  historySidebar?.classList.remove("open");
});

document.addEventListener("click", (e) => {
  if (window.innerWidth <= 860 && historySidebar?.classList.contains("open") && !historySidebar.contains(e.target) && !historyToggle.contains(e.target)) {
    historySidebar.classList.remove("open");
  }
});

// Intro screen dismiss handler
const introEl = document.querySelector("#daylight-intro");
if (introEl) {
  introEl.addEventListener("animationend", (e) => {
    if (e.animationName === "intro-dismiss") {
      introEl.remove();
    }
  });
}

async function initialize() {
  try {
    const session = await api("/api/session");
    if (!session.user) {
      window.location.replace("/?next=%2Fask-ai");
      return;
    }
    csrfToken = session.csrfToken;
    window.DaylightAccount?.initAccountPopover(session.user, { api, showToast });
    window.DaylightModels?.initModelPicker({ showToast });
    window.DaylightVoice?.initVoiceChat({ input, updateSendButtonState, showToast, getCsrfToken: () => csrfToken });
    setChatViewMode(true);
    updateSendButtonState();
    await loadConversations();
  } catch (error) {
    showToast(error.message);
  }
}

initialize();
