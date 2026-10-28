const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const list = document.querySelector("#task-list");
const emptyState = document.querySelector("#empty-state");
const clearButton = document.querySelector("#clear-completed");
const toast = document.querySelector("#toast");
const filters = [...document.querySelectorAll("[data-filter]")];
const authGate = document.querySelector("#auth-gate");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");

let tasks = [];
let currentFilter = "all";
let searchQuery = "";
let currentSort = "newest";
let editingTaskId = null;
let toastTimer;
let csrfToken = "";
let isRegistering = false;
let currentUser = null;
let currentProviders = { google: false, facebook: false };
let currentAiProvider = "openai";

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function providerIconMarkup(provider) {
  if (provider === "google") {
    return '<svg class="social-logo google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.25 5.48-4.73 7.18l7.69 5.97c4.49-4.14 7.14-10.24 7.14-17.62Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.94-2.13 15.92-5.82l-7.69-5.97c-2.13 1.43-4.86 2.27-8.23 2.27-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
  }
  return '<svg class="social-logo facebook-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.093 10.125 24v-8.438H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.1 24 12.073Z"/></svg>';
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET" && csrfToken) headers.set("X-CSRF-Token", csrfToken);
  const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
  if (response.status === 204) return null;
  const responseText = await response.text();
  let data = {};
  try { data = responseText ? JSON.parse(responseText) : {}; }
  catch { if (responseText) data.error = responseText; }
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDueDate(dueDateStr) {
  if (!dueDateStr) return "";
  const [y, m, d] = dueDateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr = getLocalDateString();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrow);

  if (dueDateStr === todayStr) return "Today";
  if (dueDateStr === tomorrowStr) return "Tomorrow";
  if (dueDateStr < todayStr) return `Overdue (${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)})`;
  return `Due ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}`;
}

function render() {
  const todayStr = getLocalDateString();
  const activeTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  const todayTasks = activeTasks.filter((task) => task.dueDate === todayStr);

  let visibleTasks = tasks.filter((task) => {
    if (currentFilter === "today") return !task.completed && task.dueDate === todayStr;
    if (currentFilter === "active") return !task.completed;
    if (currentFilter === "completed") return task.completed;
    return true;
  });

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    visibleTasks = visibleTasks.filter((task) => task.text.toLowerCase().includes(q));
  }

  visibleTasks.sort((a, b) => {
    if (currentSort === "due") {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (currentSort === "priority") {
      const pWeights = { high: 3, medium: 2, low: 1, none: 0 };
      const wA = pWeights[a.priority] || 0;
      const wB = pWeights[b.priority] || 0;
      return wB - wA;
    }
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  list.replaceChildren();
  for (const task of visibleTasks) {
    const row = document.createElement("li");
    row.className = `task-row${task.completed ? " done" : ""}`;
    row.dataset.taskId = task.id;

    const check = document.createElement("button");
    check.className = "check-button";
    check.type = "button";
    check.setAttribute("aria-label", task.completed ? `Mark ${task.text} as active` : `Complete ${task.text}`);
    check.setAttribute("aria-pressed", String(task.completed));
    const checkmark = document.createElement("span");
    checkmark.textContent = task.completed ? "✓" : "";
    check.append(checkmark);
    check.addEventListener("click", () => toggleTask(task));

    row.append(check);

    if (task.priority && task.priority !== "none") {
      const priorityBadge = document.createElement("span");
      priorityBadge.className = `priority-badge priority-${task.priority}`;
      priorityBadge.textContent = task.priority.toUpperCase();
      priorityBadge.title = `Priority: ${task.priority}`;
      row.append(priorityBadge);
    }

    if (editingTaskId === task.id) {
      const editForm = document.createElement("form");
      editForm.className = "task-edit-form";

      const editInput = document.createElement("input");
      editInput.type = "text";
      editInput.className = "task-edit-input";
      editInput.maxLength = 140;
      editInput.value = task.text;
      editInput.required = true;

      const saveBtn = document.createElement("button");
      saveBtn.type = "submit";
      saveBtn.className = "task-edit-save";
      saveBtn.setAttribute("aria-label", "Save task title");
      saveBtn.title = "Save";
      saveBtn.textContent = "✓";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "task-edit-cancel";
      cancelBtn.setAttribute("aria-label", "Cancel editing");
      cancelBtn.title = "Cancel (Esc)";
      cancelBtn.textContent = "✕";
      cancelBtn.addEventListener("click", () => {
        editingTaskId = null;
        render();
      });

      editInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          editingTaskId = null;
          render();
        }
      });

      editForm.append(editInput, saveBtn, cancelBtn);
      editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newText = editInput.value.trim();
        if (newText && newText !== task.text) {
          await updateTaskText(task, newText);
        }
        editingTaskId = null; 
        render();
      });

      row.append(editForm);
      window.setTimeout(() => editInput.focus(), 15);
    } else {
      const text = document.createElement("span");
      text.className = "task-text";
      text.textContent = task.text;
      text.title = "Double-click to edit";
      text.addEventListener("dblclick", () => {
        if (!task.completed) {
          editingTaskId = task.id;
          render();
        }
      });
      row.append(text);

      if (task.dueDate) {
        const dueDateBadge = document.createElement("span");
        const isOverdue = !task.completed && task.dueDate < todayStr;
        const isDueToday = task.dueDate === todayStr;
        dueDateBadge.className = `due-badge${isOverdue ? " due-overdue" : isDueToday ? " due-today" : ""}`;
        dueDateBadge.textContent = formatDueDate(task.dueDate);
        row.append(dueDateBadge);
      }

      const date = document.createElement("time");
      date.className = "task-date";
      date.dateTime = task.createdAt;
      date.textContent = formatDate(task.createdAt);
      row.append(date);

      const actions = document.createElement("div");
      actions.className = "task-actions";

      if (!task.completed) {
        const editBtn = document.createElement("button");
        editBtn.className = "edit-button";
        editBtn.type = "button";
        editBtn.setAttribute("aria-label", `Edit ${task.text}`);
        editBtn.title = "Edit task";
        editBtn.textContent = "✎";
        editBtn.addEventListener("click", () => {
          editingTaskId = task.id;
          render();
        });
        actions.append(editBtn);
      }

      const remove = document.createElement("button");
      remove.className = "delete-button";
      remove.type = "button";
      remove.setAttribute("aria-label", `Delete ${task.text}`);
      remove.title = "Delete task";
      remove.textContent = "×";
      remove.addEventListener("click", () => deleteTask(task));
      actions.append(remove);

      row.append(actions);
    }

    list.append(row);
  }

  document.querySelector("#all-count").textContent = tasks.length;
  document.querySelector("#active-count").textContent = activeTasks.length;
  document.querySelector("#completed-count").textContent = completedTasks.length;
  const todayCountEl = document.querySelector("#today-count");
  if (todayCountEl) todayCountEl.textContent = todayTasks.length;

  document.querySelector("#footer-count").textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  clearButton.hidden = completedTasks.length === 0;
  emptyState.classList.toggle("visible", visibleTasks.length === 0);

  const emptyMessages = {
    all: ["A clean slate.", searchQuery ? "No tasks found matching your search." : "Add your first task above or ask Daylight AI for a plan."],
    today: ["No tasks due today.", "Add a due date to a task or enjoy a light schedule!"],
    active: ["All caught up.", "There are no tasks in progress right now."],
    completed: ["Nothing checked off yet.", "Finish a task and it’ll show up here."],
  };
  const activeMessage = emptyMessages[currentFilter] || emptyMessages.all;
  document.querySelector("#empty-title").textContent = activeMessage[0];
  document.querySelector("#empty-copy").textContent = activeMessage[1];
  document.querySelector("#list-title").textContent = currentFilter === "completed" ? "Completed tasks" : currentFilter === "today" ? "Due today" : currentFilter === "active" ? "In progress" : "Today’s focus";

  const completion = tasks.length === 0 ? 0 : Math.round((completedTasks.length / tasks.length) * 100);
  document.querySelector("#progress-value").textContent = `${completion}%`;
  document.querySelector("#progress-ring").style.setProperty("--progress", `${completion}%`);
  document.querySelector("#progress-title").textContent = tasks.length === 0 ? "Fresh start" : completion === 100 ? "All done!" : `${activeTasks.length} left to go`;
  document.querySelector("#progress-caption").textContent = tasks.length === 0 ? "Let’s make today count" : `${completedTasks.length} of ${tasks.length} completed`;
}

function updateFilterButtons() {
  for (const button of filters) {
    const isActive = button.dataset.filter === currentFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  }
}

async function addTask(text, dueDate = null, priority = "none") {
  try {
    const result = await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ text, dueDate: dueDate || null, priority: priority || "none" }),
    });
    tasks.unshift(result.task);
    currentFilter = "all";
    updateFilterButtons();
    render();
    showToast("Task added — you’ve got this.");
  } catch (error) { showToast(error.message); }
}

async function updateTaskText(task, newText) {
  try {
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ text: newText }),
    });
    tasks = tasks.map((item) => (item.id === task.id ? { ...item, text: newText } : item));
    render();
    showToast("Task updated.");
  } catch (error) { showToast(error.message); }
}

async function toggleTask(task) {
  const completed = !task.completed;
  try {
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ completed }) });
    tasks = tasks.map((item) => item.id === task.id ? { ...item, completed } : item);
    render();
  } catch (error) { showToast(error.message); }
}

async function deleteTask(task) {
  try {
    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    tasks = tasks.filter((item) => item.id !== task.id);
    render();
    showToast("Task removed.");
  } catch (error) { showToast(error.message); }
}

function setAuthMode(registering) {
  const card = document.querySelector("#auth-card");
  const tabs = document.querySelector("#auth-tabs");
  card.classList.remove("mode-changing");
  void card.offsetWidth;
  isRegistering = registering;
  card.dataset.mode = registering ? "register" : "login";
  tabs.dataset.mode = registering ? "register" : "login";
  document.querySelector("#login-tab").classList.toggle("active", !registering);
  document.querySelector("#register-tab").classList.toggle("active", registering);
  document.querySelector("#login-tab").setAttribute("aria-selected", String(!registering));
  document.querySelector("#register-tab").setAttribute("aria-selected", String(registering));
  document.querySelector("#auth-name").hidden = !registering;
  document.querySelector("#auth-name-label").hidden = !registering;
  document.querySelector("#auth-name").required = registering;
  document.querySelector("#auth-password").autocomplete = registering ? "new-password" : "current-password";
  document.querySelector("#auth-description").textContent = registering
    ? "Sign up to keep your tasks safe and plan with Daylight AI."
    : "Log in to keep your tasks safe and plan with Daylight AI.";
  document.querySelector("#auth-submit").innerHTML = registering ? 'Sign up <span aria-hidden="true">↗</span>' : 'Log in <span aria-hidden="true">↗</span>';
  document.querySelector("#auth-password").placeholder = registering ? "Create a password (10+ characters)" : "Your password";
  authError.hidden = true;
  authError.textContent = "";
  card.classList.add("mode-changing");
  window.setTimeout(() => card.classList.remove("mode-changing"), 260);
}

function showAuthGate(sessionInfo) {
  csrfToken = sessionInfo.csrfToken;
  currentProviders = sessionInfo.providers || { google: false, facebook: false };
  document.querySelector("#app-shell").hidden = true;
  for (const provider of ["google", "facebook"]) {
    const button = document.querySelector(`#${provider}-signin`);
    const configured = Boolean(currentProviders[provider]);
    button.dataset.configured = String(configured);
    button.title = configured ? `Sign in with ${provider}` : `${provider} sign-in is not available on this server yet`;
  }
  document.querySelector("#auth-divider").hidden = false;
  document.querySelector("#auth-card").dataset.mode = isRegistering ? "register" : "login";
  document.querySelector("#auth-tabs").dataset.mode = isRegistering ? "register" : "login";
  authGate.hidden = false;
  document.querySelector("#auth-email").focus();
}

async function importLegacyTasks() {
  let legacy;
  try { legacy = JSON.parse(localStorage.getItem("daylight.tasks.v1") || "[]"); }
  catch { legacy = []; }
  if (!Array.isArray(legacy) || !legacy.length) return;
  if (!window.confirm(`Import ${legacy.length} tasks saved in this browser to the signed-in Daylight account?`)) return;
  try {
    if (tasks.length === 0) {
      for (const task of legacy.slice(0, 100)) {
        if (typeof task?.text === "string" && task.text.trim()) {
          const result = await api("/api/tasks", { method: "POST", body: JSON.stringify({ text: task.text.trim().slice(0, 140) }) });
          tasks.push(result.task);
        }
        if (task?.completed && tasks.length) {
          const imported = tasks[tasks.length - 1];
          await api(`/api/tasks/${encodeURIComponent(imported.id)}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
          imported.completed = true;
        }
      }
    }
    localStorage.removeItem("daylight.tasks.v1");
  } catch {
    showToast("Some old tasks could not be imported. Your original browser data is still saved.");
  }
}

async function startAuthenticated(sessionInfo) {
  const nextPage = new URLSearchParams(window.location.search).get("next");
  if (nextPage === "/ask-ai") {
    window.location.replace(nextPage);
    return;
  }
  csrfToken = sessionInfo.csrfToken;
  tasks = sessionInfo.tasks;
  currentUser = sessionInfo.user;
  currentProviders = sessionInfo.providers || currentProviders;
  currentAiProvider = sessionInfo.aiProvider || currentAiProvider;
  document.querySelector("#app-shell").hidden = false;
  document.querySelector("#account-name").textContent = sessionInfo.user.name || sessionInfo.user.email || "Daylight account";
  const avatar = document.querySelector("#account-menu-button");
  avatar.textContent = (sessionInfo.user.name || sessionInfo.user.email || "Y").trim().charAt(0).toUpperCase();
  avatar.title = "Manage linked accounts and sign-in sessions";
  document.querySelector("#popover-name").textContent = sessionInfo.user.name || "Daylight account";
  document.querySelector("#popover-email").textContent = sessionInfo.user.email || "Connected with a social account";
  document.querySelector("#popover-avatar").textContent = avatar.textContent;
  document.querySelector("#account-controls").hidden = false;
  authGate.hidden = true;
  render();
  rememberAccount(sessionInfo.user);
  await refreshAccountMenu();
  await importLegacyTasks();
  render();
  if (!sessionInfo.aiEnabled) {
    const keyName = currentAiProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY";
    showToast(`Add ${keyName} to the server .env file to turn on AI chat.`);
  }
}

async function loadSession() {
  try {
    const sessionInfo = await api("/api/session");
    if (sessionInfo.user) await startAuthenticated(sessionInfo);
    else showAuthGate(sessionInfo);
    const authStatus = new URLSearchParams(location.search).get("auth");
    const accountLinkStatus = new URLSearchParams(location.search).get("accountLink");
    if (authStatus === "not-configured") {
      authError.textContent = "Social sign-in isn’t available on this server yet. Log in with your email and password for now.";
      authError.hidden = false;
    } else if (authStatus === "failed") {
      authError.textContent = "Sign-in with that provider didn’t complete. Try again or use email.";
      authError.hidden = false;
    } else if (authStatus === "email-in-use") {
      authError.textContent = "That email already belongs to a Daylight account. Log in first, then link Google or Facebook from your profile.";
      authError.hidden = false;
    }
    if (accountLinkStatus) {
      const messages = {
        success: "Provider connected to your Daylight account.",
        "already-linked": "That social account is already linked to another Daylight account.",
        "provider-exists": "This account already has a sign-in method for that provider.",
        failed: "Couldn’t link the provider. No account changes were made.",
        "not-configured": "Social sign-in isn’t available on this server yet.",
      };
      showToast(messages[accountLinkStatus] || "Account settings updated.");
      if (sessionInfo.user) await refreshAccountMenu();
    }
    if (authStatus || accountLinkStatus) history.replaceState({}, "", location.pathname);
  } catch (error) {
    showAuthGate({ csrfToken: "", providers: { google: false, facebook: false } });
    authError.textContent = `Can’t reach the Daylight server. Start the app using npm start. (${error.message})`;
    authError.hidden = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return input.focus();
  const dueInput = document.querySelector("#task-due");
  const priorityInput = document.querySelector("#task-priority");
  const dueDate = dueInput?.value || null;
  const priority = priorityInput?.value || "none";
  input.value = "";
  if (dueInput) dueInput.value = "";
  if (priorityInput) priorityInput.value = "none";
  await addTask(text, dueDate, priority);
  input.focus();
});

const searchInput = document.querySelector("#task-search");
searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  render();
});

const sortSelect = document.querySelector("#task-sort");
sortSelect?.addEventListener("change", (e) => {
  currentSort = e.target.value;
  render();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    input.focus();
  }
});

filters.forEach((button) => button.addEventListener("click", () => {
  currentFilter = button.dataset.filter;
  updateFilterButtons();
  render();
}));

clearButton.addEventListener("click", async () => {
  const removed = tasks.filter((task) => task.completed).length;
  try {
    await api("/api/tasks/completed", { method: "DELETE" });
    tasks = tasks.filter((task) => !task.completed);
    render();
    showToast(`${removed} completed ${removed === 1 ? "task" : "tasks"} cleared.`);
  } catch (error) { showToast(error.message); }
});

document.querySelector("#login-tab").addEventListener("click", () => setAuthMode(false));
document.querySelector("#register-tab").addEventListener("click", () => setAuthMode(true));
document.querySelector("#password-toggle").addEventListener("click", () => {
  const password = document.querySelector("#auth-password");
  const toggle = document.querySelector("#password-toggle");
  const showing = password.type === "password";
  password.type = showing ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(showing));
  toggle.setAttribute("aria-label", showing ? "Hide password" : "Show password");
  toggle.title = showing ? "Hide password" : "Show password";
  password.focus();
});
document.querySelectorAll(".provider-oauth").forEach((button) => {
  button.addEventListener("click", () => {
    const provider = button.dataset.provider;
    if (currentProviders[provider]) window.location.assign(`/auth/${provider}`);
    else {
      authError.textContent = `${provider === "google" ? "Google" : "Facebook"} sign-in is not available on this server yet. Log in with your email and password for now.`;
      authError.hidden = false;
    }
  });
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = document.querySelector("#auth-submit");
  submit.disabled = true;
  authError.hidden = true;
  try {
    await api(isRegistering ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        name: document.querySelector("#auth-name").value.trim(),
        email: document.querySelector("#auth-email").value,
        password: document.querySelector("#auth-password").value,
        rememberMe: document.querySelector("#remember-me").checked,
      }),
    });
    authForm.reset();
    await loadSession();
  } catch (error) {
    authError.textContent = error.message;
    authError.hidden = false;
  } finally { submit.disabled = false; }
});

function getRememberedAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem("daylight.accounts.v1") || "[]");
    return Array.isArray(stored) ? stored.filter((account) => typeof account.email === "string").slice(0, 5) : [];
  } catch { return []; }
}

function rememberAccount(user) {
  if (!user?.email) return;
  const accounts = getRememberedAccounts().filter((account) => account.email.toLowerCase() !== user.email.toLowerCase());
  accounts.unshift({ email: user.email, name: user.name || user.email.split("@")[0] });
  try { localStorage.setItem("daylight.accounts.v1", JSON.stringify(accounts.slice(0, 5))); }
  catch { /* Remembered accounts are only a convenience; account login remains server-backed. */ }
}

async function refreshAccountMenu() {
  if (!currentUser) return;
  try {
    const result = await api("/api/accounts");
    const linkedList = document.querySelector("#linked-account-list");
    const actions = document.querySelector("#connect-actions");
    linkedList.replaceChildren();
    actions.replaceChildren();
    const signedMethods = [];
    if (result.methods.email) signedMethods.push({ provider: "email", label: "Daylight Account", detail: result.user.email, icon: "@" });
    for (const account of result.linkedAccounts) {
      signedMethods.push({ provider: account.provider, label: account.provider === "google" ? "Google" : "Facebook", detail: account.email || account.display_name, icon: account.provider === "google" ? "G" : "f" });
    }
    for (const method of signedMethods) {
      const row = document.createElement("div");
      row.className = "linked-account-row";
      const icon = document.createElement("span");
      icon.className = `provider-icon ${method.provider}-icon`;
      icon.innerHTML = method.provider === "google" || method.provider === "facebook" ? providerIconMarkup(method.provider) : method.icon;
      const description = document.createElement("span");
      description.className = "linked-account-description";
      const title = document.createElement("strong");
      title.textContent = method.label;
      const detail = document.createElement("span");
      detail.textContent = method.detail || "Connected";
      description.append(title, detail);
      const status = document.createElement("span");
      status.className = "connected-status";
      status.textContent = "Connected";
      row.append(icon, description, status);
      if (method.provider !== "email" && (result.methods.email || result.linkedAccounts.length > 1)) {
        const unlink = document.createElement("button");
        unlink.className = "unlink-button";
        unlink.type = "button";
        unlink.textContent = "Remove";
        unlink.setAttribute("aria-label", `Unlink ${method.label}`);
        unlink.addEventListener("click", () => unlinkProvider(method.provider));
        row.append(unlink);
      }
      linkedList.append(row);
    }
    for (const provider of ["google", "facebook"]) {
      if (result.methods[provider]) continue;
      const link = document.createElement(result.providers[provider] ? "a" : "button");
      link.className = "connect-account-button";
      if (result.providers[provider]) link.href = `/auth/link/${provider}`;
      else {
        link.type = "button";
        link.addEventListener("click", () => showToast(`${provider === "google" ? "Google" : "Facebook"} sign-in is not available on this server yet.`));
      }
      link.innerHTML = `${providerIconMarkup(provider)} Connect ${provider === "google" ? "Google" : "Facebook"} account`;
      actions.append(link);
    }
    renderRememberedAccounts();
  } catch (error) { showToast(error.message); }
}

function renderRememberedAccounts() {
  const accounts = getRememberedAccounts();
  const container = document.querySelector("#saved-accounts");
  const listElement = document.querySelector("#saved-account-list");
  listElement.replaceChildren();
  const others = accounts.filter((account) => account.email.toLowerCase() !== currentUser?.email?.toLowerCase());
  container.hidden = others.length === 0;
  for (const account of others) {
    const button = document.createElement("button");
    button.className = "saved-account-button";
    button.type = "button";
    const avatar = document.createElement("span");
    avatar.className = "account-avatar-small saved-avatar";
    avatar.textContent = (account.name || account.email).charAt(0).toUpperCase();
    const identity = document.createElement("span");
    identity.innerHTML = `<strong></strong><span></span>`;
    identity.querySelector("strong").textContent = account.name || account.email;
    identity.querySelector("span").textContent = account.email;
    const arrow = document.createElement("span");
    arrow.className = "saved-account-arrow";
    arrow.textContent = "↗";
    button.append(avatar, identity, arrow);
    button.addEventListener("click", () => switchAccountTo(account.email));
    listElement.append(button);
  }
}

async function unlinkProvider(provider) {
  try {
    await api(`/api/accounts/link/${provider}`, { method: "DELETE" });
    await refreshAccountMenu();
    showToast(`${provider === "google" ? "Google" : "Facebook"} disconnected.`);
  } catch (error) { showToast(error.message); }
}

function setAccountPopover(open) {
  const button = document.querySelector("#account-menu-button");
  const popover = document.querySelector("#account-popover");
  popover.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) refreshAccountMenu();
}

document.querySelector("#account-menu-button").addEventListener("click", () => {
  setAccountPopover(document.querySelector("#account-popover").hidden);
});
document.querySelector("#close-account-popover").addEventListener("click", () => setAccountPopover(false));
document.addEventListener("pointerdown", (event) => {
  const wrap = document.querySelector(".account-menu-wrap");
  if (!wrap.contains(event.target)) setAccountPopover(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setAccountPopover(false);
});

async function switchAccountTo(email = "") {
  setAccountPopover(false);
  try {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    currentUser = null;
    document.querySelector("#account-controls").hidden = true;
    await loadSession();
    if (email) {
      document.querySelector("#auth-email").value = email;
      document.querySelector("#auth-password").focus();
    }
  } catch (error) { showToast(error.message); }
}

document.querySelector("#switch-account-button").addEventListener("click", () => switchAccountTo());
document.querySelector("#sign-out-all-button").addEventListener("click", async () => {
  if (!window.confirm("Sign out this Daylight account on all devices and browsers?")) return;
  try {
    await api("/api/auth/logout-all", { method: "POST", body: JSON.stringify({}) });
    currentUser = null;
    setAccountPopover(false);
    await loadSession();
    showToast("Signed out of all sessions.");
  } catch (error) { showToast(error.message); }
});

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long", month: "long", day: "numeric",
}).format(new Date());

loadSession();
