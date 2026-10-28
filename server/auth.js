import "./config.js";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { timingSafeEqual } from "node:crypto";
import { db, REMEMBERED_SESSION_MS } from "./db.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function displayNameFromEmail(email) {
  return email.split("@")[0].slice(0, 40) || "Daylight user";
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: "Too many sign-in attempts. Please wait a few minutes and try again." }),
});

export function requireAuth(req, res, next) {
  if (req.isAuthenticated?.()) return next();
  res.status(401).json({ error: "Please sign in to continue." });
}

export function requireCsrf(req, res, next) {
  const expected = req.session.csrfToken;
  const supplied = req.get("x-csrf-token") || "";
  const expBuf = Buffer.from(expected || "");
  const supBuf = Buffer.from(supplied);
  if (!expected || !supplied || expBuf.length !== supBuf.length || !timingSafeEqual(expBuf, supBuf)) {
    return res.status(403).json({ error: "Security token expired. Refresh the page and try again." });
  }
  next();
}

export function setRememberedSession(req, rememberMe) {
  req.session.cookie.maxAge = rememberMe === true ? REMEMBERED_SESSION_MS : null;
}

export function completeLogin(req, res, user, statusCode, next, responseBody) {
  req.login(user, (loginError) => {
    if (loginError) return next(loginError);
    setRememberedSession(req, req.body?.rememberMe);
    req.session.save((saveError) => {
      if (saveError) return next(saveError);
      res.status(statusCode).json(responseBody);
    });
  });
}

// Passport Serializers
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try {
    done(null, db.prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(id) || false);
  } catch (error) {
    done(error);
  }
});

// Local Strategy
passport.use(new LocalStrategy({ usernameField: "email", passwordField: "password" }, (email, password, done) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND password_hash IS NOT NULL").get(normalizeEmail(email));
    if (!user) return done(null, false, { message: "Email or password is incorrect." });
    bcrypt.compare(password, user.password_hash).then((valid) => {
      if (!valid) return done(null, false, { message: "Email or password is incorrect." });
      return done(null, { id: user.id, email: user.email, display_name: user.display_name });
    }).catch(done);
  } catch (error) { done(error); }
}));

// OAuth Configurations
export const googleClientId = process.env.GOOGLE_CLIENT_ID;
export const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const port = Number(process.env.PORT || 3000);

if (googleClientId && googleClientSecret) {
  passport.use(new GoogleStrategy({
    clientID: googleClientId,
    clientSecret: googleClientSecret,
    state: true,
    passReqToCallback: true,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || `http://localhost:${port}/auth/google/callback`,
  }, (req, accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.find((item) => item.verified !== false)?.value || profile.emails?.[0]?.value || null;
    done(null, { provider: "google", providerId: profile.id, email, name: profile.displayName });
  }));
}

export const facebookAppId = process.env.FACEBOOK_APP_ID;
export const facebookAppSecret = process.env.FACEBOOK_APP_SECRET;

if (facebookAppId && facebookAppSecret) {
  passport.use(new FacebookStrategy({
    clientID: facebookAppId,
    clientSecret: facebookAppSecret,
    state: true,
    passReqToCallback: true,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || `http://localhost:${port}/auth/facebook/callback`,
    profileFields: ["id", "displayName", "emails"],
  }, (req, accessToken, refreshToken, profile, done) => {
    done(null, { provider: "facebook", providerId: profile.id, email: profile.emails?.[0]?.value || null, name: profile.displayName });
  }));
}

export { passport };
