/**
 * Daylight Account & Popover Manager
 * Handles user profile display, remembered accounts, OAuth provider linking, and account switching.
 */

let currentUser = null;

function providerIconMarkup(provider) {
  if (provider === "google") {
    return '<svg class="social-logo google-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.88c-.58 2.96-2.25 5.48-4.73 7.18l7.69 5.97c4.49-4.14 7.14-10.24 7.14-17.62Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.94-2.13 15.92-5.82l-7.69-5.97c-2.13 1.43-4.86 2.27-8.23 2.27-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>';
  }
  return '<svg class="social-logo facebook-logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.093 10.125 24v-8.438H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.1 24 12.073Z"/></svg>';
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

function renderRememberedAccounts({ onSwitchAccount } = {}) {
  const accounts = getRememberedAccounts();
  const container = document.querySelector("#saved-accounts");
  const listElement = document.querySelector("#saved-account-list");
  if (!container || !listElement) return;

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
    button.addEventListener("click", () => {
      if (onSwitchAccount) onSwitchAccount(account.email);
      else switchAccountTo(account.email);
    });
    listElement.append(button);
  }
}

async function unlinkProvider(provider, { api, showToast } = {}) {
  try {
    await api(`/api/accounts/link/${provider}`, { method: "DELETE" });
    await refreshAccountMenu({ api, showToast });
    showToast(`${provider === "google" ? "Google" : "Facebook"} disconnected.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshAccountMenu({ api = window.fetch, showToast = () => {} } = {}) {
  if (!currentUser) return;
  try {
    const res = await api("/api/accounts");
    const result = typeof res.json === "function" ? await res.json() : res;

    const linkedList = document.querySelector("#linked-account-list");
    const actions = document.querySelector("#connect-actions");
    if (!linkedList || !actions) return;

    linkedList.replaceChildren();
    actions.replaceChildren();

    const signedMethods = [];
    if (result.methods.email) {
      signedMethods.push({
        provider: "email",
        label: "Daylight Account",
        detail: result.user.email,
        icon: "@"
      });
    }

    for (const account of result.linkedAccounts) {
      signedMethods.push({
        provider: account.provider,
        label: account.provider === "google" ? "Google" : "Facebook",
        detail: account.email || account.display_name,
        icon: account.provider === "google" ? "G" : "f"
      });
    }

    for (const method of signedMethods) {
      const row = document.createElement("div");
      row.className = "linked-account-row";

      const icon = document.createElement("span");
      icon.className = `provider-icon ${method.provider}-icon`;
      icon.innerHTML = method.provider === "google" || method.provider === "facebook" ? providerIconMarkup(method.provider) : method.icon;

      const description = document.createElement("span");
      description.className = "linked-account-description";
      description.innerHTML = `<strong></strong><span></span>`;
      description.querySelector("strong").textContent = method.label;
      description.querySelector("span").textContent = method.detail;

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
        unlink.addEventListener("click", () => unlinkProvider(method.provider, { api, showToast }));
        row.append(unlink);
      }

      linkedList.append(row);
    }

    for (const provider of ["google", "facebook"]) {
      if (result.methods[provider]) continue;
      const link = document.createElement(result.providers[provider] ? "a" : "button");
      link.className = "connect-account-button";
      if (result.providers[provider]) {
        link.href = `/auth/link/${provider}`;
      } else {
        link.type = "button";
        link.addEventListener("click", () =>
          showToast(`${provider === "google" ? "Google" : "Facebook"} sign-in is not available on this server yet.`)
        );
      }
      link.innerHTML = `${providerIconMarkup(provider)} Connect ${provider === "google" ? "Google" : "Facebook"} account`;
      actions.append(link);
    }

    renderRememberedAccounts();
  } catch (error) {
    showToast(error.message);
  }
}

function setAccountPopover(open, { api, showToast } = {}) {
  const button = document.querySelector("#account-menu-button");
  const popover = document.querySelector("#account-popover");
  if (!button || !popover) return;
  popover.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  if (open) refreshAccountMenu({ api, showToast });
}

async function switchAccountTo(email = "", { api = window.fetch } = {}) {
  setAccountPopover(false);
  try {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch {}
  window.location.replace(`/?next=%2Fask-ai${email ? `&switch=${encodeURIComponent(email)}` : ""}`);
}

function initAccountPopover(user, { api, showToast } = {}) {
  currentUser = user;
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
  const popoverName = document.querySelector("#popover-name");
  const popoverEmail = document.querySelector("#popover-email");
  const popoverAvatar = document.querySelector("#popover-avatar");

  const displayName = user.name || user.email || "Daylight account";
  const initial = (user.name || user.email || "Y").trim().charAt(0).toUpperCase();

  if (nameEl) nameEl.textContent = displayName;
  if (avatarBtn) {
    avatarBtn.textContent = initial;
    avatarBtn.title = "Manage linked accounts and sign-in sessions";
  }
  if (popoverName) popoverName.textContent = user.name || "Daylight account";
  if (popoverEmail) popoverEmail.textContent = user.email || "Connected with a social account";
  if (popoverAvatar) popoverAvatar.textContent = initial;

  avatarBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const popover = document.querySelector("#account-popover");
    setAccountPopover(popover?.hidden, { api, showToast });
  });

  document.querySelector("#close-account-popover")?.addEventListener("click", () => setAccountPopover(false));

  document.addEventListener("pointerdown", (event) => {
    const wrap = document.querySelector(".account-menu-wrap");
    if (wrap && !wrap.contains(event.target)) setAccountPopover(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setAccountPopover(false);
  });

  document.querySelector("#switch-account-button")?.addEventListener("click", () => switchAccountTo("", { api }));

  document.querySelector("#sign-out-all-button")?.addEventListener("click", async () => {
    if (!window.confirm("Sign out this Daylight account on all devices and browsers?")) return;
    try {
      await api("/api/auth/logout-all", { method: "POST", body: JSON.stringify({}) });
    } catch {}
    window.location.replace("/?next=%2Fask-ai");
  });
}

window.DaylightAccount = {
  providerIconMarkup,
  getRememberedAccounts,
  rememberAccount,
  renderRememberedAccounts,
  unlinkProvider,
  refreshAccountMenu,
  setAccountPopover,
  switchAccountTo,
  initAccountPopover
};
