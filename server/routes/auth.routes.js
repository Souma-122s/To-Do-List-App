import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import {
  passport,
  requireAuth,
  requireCsrf,
  authLimiter,
  normalizeEmail,
  displayNameFromEmail,
  completeLogin,
  googleClientId,
  googleClientSecret,
  facebookAppId,
  facebookAppSecret,
} from "../auth.js";
import { tasksForUser } from "./tasks.routes.js";
import { aiClient, aiProvider } from "../ai-service.js";

const router = Router();
const isProduction = process.env.NODE_ENV === "production";

function findOrCreateOAuthUserSync(identity) {
  const { provider, providerId, email, name } = identity;
  const linked = db
    .prepare(
      "SELECT users.id, users.email, users.display_name FROM linked_accounts JOIN users ON users.id = linked_accounts.user_id WHERE linked_accounts.provider = ? AND linked_accounts.provider_id = ?"
    )
    .get(provider, String(providerId));
  if (linked) return linked;

  const legacy = db.prepare("SELECT id, email, display_name FROM users WHERE provider = ? AND provider_id = ?").get(provider, String(providerId));
  if (legacy) {
    db.prepare("INSERT OR IGNORE INTO linked_accounts (user_id, provider, provider_id, email, display_name) VALUES (?, ?, ?, ?, ?)")
      .run(legacy.id, provider, String(providerId), legacy.email, legacy.display_name);
    return legacy;
  }

  const normalizedEmail = email ? normalizeEmail(email) : null;
  const displayName = String(name || displayNameFromEmail(normalizedEmail || "daylight@local")).slice(0, 80);
  const result = db
    .prepare("INSERT INTO users (email, display_name, provider, provider_id) VALUES (?, ?, ?, ?)")
    .run(normalizedEmail, displayName, provider, String(providerId));

  db.prepare("INSERT INTO linked_accounts (user_id, provider, provider_id, email, display_name) VALUES (?, ?, ?, ?, ?)")
    .run(result.lastInsertRowid, provider, String(providerId), normalizedEmail, displayName);

  return db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(result.lastInsertRowid);
}

// Session Information
router.get("/api/session", (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString("hex");
  res.set("Cache-Control", "no-store").json({
    csrfToken: req.session.csrfToken,
    user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.display_name } : null,
    tasks: req.user ? tasksForUser(req.user.id) : [],
    providers: {
      google: Boolean(googleClientId && googleClientSecret),
      facebook: Boolean(facebookAppId && facebookAppSecret),
    },
    aiEnabled: Boolean(aiClient),
    aiProvider: aiProvider,
  });
});

// Registration
router.post("/api/auth/register", authLimiter, requireCsrf, async (req, res, next) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const name = String(req.body?.name || displayNameFromEmail(email)).trim().slice(0, 80);
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 128 || !name) {
    return res.status(400).json({ error: "Enter a valid email, a name, and a password with at least 10 characters." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db
      .prepare("INSERT INTO users (email, display_name, password_hash, provider, provider_id) VALUES (?, ?, ?, 'local', ?)")
      .run(email, name, passwordHash, email);
    const user = { id: result.lastInsertRowid, email, display_name: name };
    completeLogin(req, res, user, 201, next, { user: { id: user.id, email, name } });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    next(error);
  }
});

// Login
router.post("/api/auth/login", authLimiter, requireCsrf, (req, res, next) => {
  passport.authenticate("local", (error, user, info) => {
    if (error) return next(error);
    if (!user) return res.status(401).json({ error: info?.message || "Could not sign in." });
    completeLogin(req, res, user, 200, next, { user: { id: user.id, email: user.email, name: user.display_name } });
  })(req, res, next);
});

// Logout
router.post("/api/auth/logout", requireCsrf, (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((destroyError) => {
      if (destroyError) return next(destroyError);
      res.clearCookie("daylight.sid", { httpOnly: true, secure: isProduction, sameSite: "lax" });
      res.status(204).end();
    });
  });
});

// Logout of All Sessions
router.post("/api/auth/logout-all", requireAuth, requireCsrf, (req, res, next) => {
  const userId = req.user.id;
  try {
    const sessionRows = db.prepare("SELECT sid, sess FROM sessions").all();
    const deleteSession = db.prepare("DELETE FROM sessions WHERE sid = ?");
    for (const row of sessionRows) {
      try {
        const stored = JSON.parse(row.sess);
        if (stored.passport?.user === userId) deleteSession.run(row.sid);
      } catch {
        /* Ignore malformed session */
      }
    }
    req.logout((error) => {
      if (error) return next(error);
      req.session.destroy((destroyError) => {
        if (destroyError) return next(destroyError);
        res.clearCookie("daylight.sid", { httpOnly: true, secure: isProduction, sameSite: "lax" });
        res.status(204).end();
      });
    });
  } catch (error) {
    next(error);
  }
});

// Social Authentication Routes
for (const provider of ["google", "facebook"]) {
  const strategyEnabled = provider === "google" ? googleClientId && googleClientSecret : facebookAppId && facebookAppSecret;

  router.get(`/auth/${provider}`, (req, res, next) => {
    if (!strategyEnabled) return res.redirect("/?auth=not-configured");
    passport.authenticate(provider, { scope: provider === "google" ? ["profile", "email"] : ["email"] })(req, res, next);
  });

  router.get(`/auth/link/${provider}`, requireAuth, (req, res, next) => {
    if (!strategyEnabled) return res.redirect("/?accountLink=not-configured");
    const alreadyLinked = db.prepare("SELECT 1 FROM linked_accounts WHERE user_id = ? AND provider = ?").get(req.user.id, provider);
    if (alreadyLinked) return res.redirect("/?accountLink=provider-exists");
    req.session.pendingOAuthLink = req.user.id;
    req.session.save((error) => {
      if (error) return next(error);
      passport.authenticate(provider, { scope: provider === "google" ? ["profile", "email"] : ["email"] })(req, res, next);
    });
  });

  router.get(`/auth/${provider}/callback`, (req, res, next) => {
    if (!strategyEnabled) return res.redirect("/?auth=not-configured");
    passport.authenticate(provider, (authError, identity) => {
      if (authError) return next(authError);
      if (!identity) return res.redirect("/?auth=failed");

      const linkingUserId = req.session.pendingOAuthLink;
      delete req.session.pendingOAuthLink;

      if (linkingUserId) {
        if (!req.isAuthenticated?.() || req.user.id !== linkingUserId) {
          return req.session.save((saveError) => (saveError ? next(saveError) : res.redirect("/?accountLink=failed")));
        }
        try {
          const existing = db.prepare("SELECT user_id FROM linked_accounts WHERE provider = ? AND provider_id = ?").get(provider, String(identity.providerId));
          if (existing && existing.user_id !== linkingUserId) {
            return req.session.save((saveError) => (saveError ? next(saveError) : res.redirect("/?accountLink=already-linked")));
          }
          const alreadyLinked = db.prepare("SELECT 1 FROM linked_accounts WHERE user_id = ? AND provider = ?").get(linkingUserId, provider);
          if (alreadyLinked && (!existing || existing.user_id !== linkingUserId)) {
            return req.session.save((saveError) => (saveError ? next(saveError) : res.redirect("/?accountLink=provider-exists")));
          }
          if (!existing) {
            db.prepare("INSERT INTO linked_accounts (user_id, provider, provider_id, email, display_name) VALUES (?, ?, ?, ?, ?)").run(
              linkingUserId,
              provider,
              String(identity.providerId),
              identity.email ? normalizeEmail(identity.email) : null,
              String(identity.name || provider).slice(0, 80)
            );
          }
          return req.session.save((saveError) => (saveError ? next(saveError) : res.redirect("/?accountLink=success")));
        } catch (linkError) {
          if (linkError.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return req.session.save((saveError) => (saveError ? next(saveError) : res.redirect("/?accountLink=already-linked")));
          }
          return next(linkError);
        }
      }

      try {
        const user = findOrCreateOAuthUserSync(identity);
        req.login(user, (loginError) => {
          if (loginError) return next(loginError);
          req.session.save((saveError) => (saveError ? next(saveError) : res.redirect("/")));
        });
      } catch (loginError) {
        if (loginError.code === "SQLITE_CONSTRAINT_UNIQUE") return res.redirect("/?auth=email-in-use");
        next(loginError);
      }
    })(req, res, next);
  });
}

// Linked Accounts API
router.get("/api/accounts", requireAuth, (req, res) => {
  const linkedAccounts = db.prepare("SELECT provider, email, display_name, linked_at FROM linked_accounts WHERE user_id = ? ORDER BY linked_at").all(req.user.id);
  const user = db.prepare("SELECT email, password_hash, provider FROM users WHERE id = ?").get(req.user.id);
  res.json({
    user: { email: user.email, name: req.user.display_name },
    methods: {
      email: Boolean(user.email && user.password_hash),
      google: linkedAccounts.some((account) => account.provider === "google"),
      facebook: linkedAccounts.some((account) => account.provider === "facebook"),
    },
    linkedAccounts,
    providers: {
      google: Boolean(googleClientId && googleClientSecret),
      facebook: Boolean(facebookAppId && facebookAppSecret),
    },
  });
});

router.post("/api/accounts/link/:provider", requireAuth, requireCsrf, (req, res, next) => {
  const provider = req.params.provider;
  const configured = provider === "google" ? googleClientId && googleClientSecret : provider === "facebook" ? facebookAppId && facebookAppSecret : false;
  if (!configured) return res.status(503).json({ error: `${provider} sign-in isn’t configured yet.` });
  req.session.pendingOAuthLink = req.user.id;
  req.session.save((error) => {
    if (error) return next(error);
    passport.authenticate(provider, { scope: provider === "google" ? ["profile", "email"] : ["email"] })(req, res, next);
  });
});

router.delete("/api/accounts/link/:provider", requireAuth, requireCsrf, (req, res) => {
  const provider = req.params.provider;
  if (!["google", "facebook"].includes(provider)) return res.status(400).json({ error: "Unsupported account provider." });
  const user = db.prepare("SELECT password_hash, provider, provider_id FROM users WHERE id = ?").get(req.user.id);
  const methods = db.prepare("SELECT provider FROM linked_accounts WHERE user_id = ?").all(req.user.id);
  if (!user.password_hash && methods.length <= 1) {
    return res.status(400).json({ error: "Add an email/password sign-in before removing your only sign-in method." });
  }
  const linked = db.prepare("SELECT provider_id FROM linked_accounts WHERE user_id = ? AND provider = ?").get(req.user.id, provider);
  if (!linked) return res.status(404).json({ error: "That provider isn’t linked to this account." });
  const unlink = db.transaction(() => {
    db.prepare("DELETE FROM linked_accounts WHERE user_id = ? AND provider = ?").run(req.user.id, provider);
    if (user.provider === provider && user.provider_id === linked.provider_id) {
      db.prepare("UPDATE users SET provider = 'local', provider_id = ? WHERE id = ?").run(`unlinked-${randomBytes(16).toString("hex")}`, req.user.id);
    }
  });
  unlink();
  res.status(204).end();
});

export default router;
