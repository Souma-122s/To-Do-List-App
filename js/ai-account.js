/**
 * Daylight Account & Popover Manager
 * Handles user profile display, remembered accounts, OAuth provider linking, and account switching.
 */

let currentUser = null;
let currentAccountConfig = {};

function formatAccountGreeting(user) {
  const hour = new Date().getHours();
  const period = hour >= 5 && hour < 12
    ? "Good Morning"
    : hour >= 12 && hour < 17
      ? "Good Afternoon"
      : hour >= 17 && hour < 21
        ? "Good Evening"
        : "Good Night";
  const name = (user?.name || user?.email?.split("@")[0] || "").trim();
  return name ? `${period}, ${name}!` : `${period}!`;
}

function providerIconMarkup(provider) {
  if (provider === "google") {
    return '<svg class="social-logo google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.25 5.48-4.73 7.18l7.69 5.97c4.49-4.14 7.14-10.24 7.14-17.62Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.94-2.13 15.92-5.82l-7.69-5.97c-2.13 1.43-4.86 2.27-8.23 2.27-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
  }
  if (provider === "microsoft") {
    return '<svg class="social-logo microsoft-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';
  }
  return "";
}

function getRememberedAccounts() {
  try {
    const stored = JSON.parse(localStorage.getItem("daylight.accounts.v1") || "[]");
    return Array.isArray(stored) ? stored.filter((account) => typeof account.email === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberAccount(user) {
  if (!user?.email) return;
  const accounts = getRememberedAccounts().filter((account) => account.email.toLowerCase() !== user.email.toLowerCase());
  accounts.unshift({ email: user.email, name: user.name || user.email.split("@")[0] });
  try {
    localStorage.setItem("daylight.accounts.v1", JSON.stringify(accounts.slice(0, 5)));
  } catch {
    // Local storage fallback
  }
}

async function refreshAccountMenu({ api, showToast } = {}) {
  if (!currentUser) return;
  const apiFn = api || currentAccountConfig.api || window.fetch;
  const toastFn = showToast || currentAccountConfig.showToast || (() => {});

  const greetingEl = document.querySelector("#popover-greeting");
  if (greetingEl) greetingEl.textContent = formatAccountGreeting(currentUser);

  try {
    const res = await apiFn("/api/accounts");
    const result = typeof res.json === "function" ? await res.json() : res;

    const linkedList = document.querySelector("#linked-account-list");
    const actions = document.querySelector("#connect-actions");
    if (!linkedList || !actions) return;

    linkedList.replaceChildren();
    actions.replaceChildren();

    const active = result.activeAuth || {
      provider: result.methods?.google ? "google" : result.methods?.microsoft ? "microsoft" : "email",
      email: result.user?.email,
      name: result.user?.name,
    };
    const activeEmail = active.email || result.user?.email || "Connected with a social account";
    const popoverEmail = document.querySelector("#popover-email");
    if (popoverEmail) popoverEmail.textContent = activeEmail;

    const row = document.createElement("div");
    row.className = "linked-account-row";

    const icon = document.createElement("span");
    icon.className = `provider-icon ${active.provider}-icon`;
    icon.innerHTML = active.provider === "google" || active.provider === "microsoft"
      ? providerIconMarkup(active.provider)
      : "@";

    const description = document.createElement("span");
    description.className = "linked-account-description";
    description.innerHTML = `<strong></strong><span></span>`;
    description.querySelector("strong").textContent = active.provider === "google"
      ? "Google"
      : active.provider === "microsoft"
        ? "Microsoft"
        : "Daylight Account";
    description.querySelector("span").textContent = activeEmail;

    const status = document.createElement("span");
    status.className = "connected-status";
    status.textContent = "Connected";

    row.append(icon, description, status);
    linkedList.append(row);

    if (!result.methods?.microsoft) {
      const link = document.createElement(result.providers?.microsoft ? "a" : "button");
      link.className = "connect-account-button";
      if (result.providers?.microsoft) {
        link.href = "/auth/link/microsoft";
      } else {
        link.type = "button";
        link.addEventListener("click", () =>
          toastFn("Microsoft sign-in is not available on this server yet.")
        );
      }
      link.innerHTML = `${providerIconMarkup("microsoft")} Connect with Microsoft account`;
      actions.append(link);
    }
  } catch (error) {
    toastFn(error.message);
  }
}

function setAccountPopover(open, options = {}) {
  const button = document.querySelector("#account-menu-button");
  const popover = document.querySelector("#account-popover");
  if (!button || !popover) return;
  popover.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) refreshAccountMenu(options);
}

async function switchAccountTo(email = "", { api = currentAccountConfig.api || window.fetch } = {}) {
  setAccountPopover(false);
  try {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  window.location.replace(`/?next=%2Fask-ai${email ? `&switch=${encodeURIComponent(email)}` : ""}`);
}

function initAccountPopover(user, { api, showToast, activeAuth, onSwitchAccount, onSignOutAll } = {}) {
  currentUser = user;
  currentAccountConfig = { api, showToast, onSwitchAccount, onSignOutAll };
  rememberAccount(user);

  const todayEl = document.querySelector("#today-label");
  if (todayEl) {
    todayEl.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(new Date());
  }

  const nameEl = document.querySelector("#account-name");
  const avatarBtn = document.querySelector("#account-menu-button");
  const greetingEl = document.querySelector("#popover-greeting");
  const popoverName = document.querySelector("#popover-name");
  const popoverEmail = document.querySelector("#popover-email");
  const popoverAvatar = document.querySelector("#popover-avatar");

  const displayName = user.name || user.email || "Daylight account";
  const initial = (user.name || user.email || "Y").trim().charAt(0).toUpperCase();

  if (nameEl) nameEl.textContent = displayName;
  if (avatarBtn) {
    avatarBtn.textContent = initial;
    avatarBtn.title = "Manage Daylight account and sessions";
  }
  if (greetingEl) greetingEl.textContent = formatAccountGreeting(user);
  if (popoverName) popoverName.textContent = user.name || "Daylight account";
  if (popoverEmail) popoverEmail.textContent = activeAuth?.email || user.email || "Connected with a social account";
  if (popoverAvatar) popoverAvatar.textContent = initial;

  const wrap = document.querySelector(".account-menu-wrap");
  if (!wrap || wrap.dataset.accountBound === "true") return;
  wrap.dataset.accountBound = "true";

  avatarBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const popover = document.querySelector("#account-popover");
    setAccountPopover(popover?.hidden);
  });

  document.querySelector("#close-account-popover")?.addEventListener("click", () => setAccountPopover(false));

  document.addEventListener("pointerdown", (event) => {
    const menuWrap = document.querySelector(".account-menu-wrap");
    if (menuWrap && !menuWrap.contains(event.target)) setAccountPopover(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setAccountPopover(false);
  });

  document.querySelector("#switch-account-button")?.addEventListener("click", () => {
    if (currentAccountConfig.onSwitchAccount) currentAccountConfig.onSwitchAccount();
    else switchAccountTo("");
  });

  document.querySelector("#sign-out-all-button")?.addEventListener("click", async () => {
    if (currentAccountConfig.onSignOutAll) {
      await currentAccountConfig.onSignOutAll();
      return;
    }
    if (!window.confirm("Sign out this Daylight account on all devices and browsers?")) return;
    const apiFn = currentAccountConfig.api || window.fetch;
    try {
      await apiFn("/api/auth/logout-all", { method: "POST", body: JSON.stringify({}) });
    } catch {}
    window.location.replace("/?next=%2Fask-ai");
  });
}

window.DaylightAccount = {
  providerIconMarkup,
  formatAccountGreeting,
  getRememberedAccounts,
  rememberAccount,
  refreshAccountMenu,
  setAccountPopover,
  switchAccountTo,
  initAccountPopover
};
