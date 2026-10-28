import "./server/config.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { SQLiteSessionStore } from "./server/db.js";
import { passport, googleClientId, googleClientSecret, facebookAppId, facebookAppSecret } from "./server/auth.js";
import { aiClient, aiProvider } from "./server/ai-service.js";
import authRoutes from "./server/routes/auth.routes.js";
import taskRoutes from "./server/routes/tasks.routes.js";
import aiRoutes from "./server/routes/ai.routes.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || randomBytes(48).toString("hex");

if (isProduction && !process.env.SESSION_SECRET) {
  console.error("Set SESSION_SECRET in .env to a random value of at least 32 characters in production.");
  process.exit(1);
}
if (!process.env.SESSION_SECRET) {
  console.warn("Using a temporary development session secret. Set SESSION_SECRET in .env to keep sessions across restarts.");
}

app.set("trust proxy", isProduction ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(
  session({
    name: "daylight.sid",
    secret: sessionSecret,
    store: new SQLiteSessionStore(),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: isProduction, sameSite: "lax" },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Mount Modular Routes
app.use(authRoutes);
app.use(taskRoutes);
app.use(aiRoutes);

// Static Web Assets & Pages
app.use(express.static(__dirname, { maxAge: isProduction ? "1d" : 0 }));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/ask-ai", (req, res) => {
  res.sendFile(path.join(__dirname, "ai.html"));
});

app.listen(port, () => {
  console.log(`Daylight is running at http://localhost:${port}`);
  if (!aiClient) console.log(`AI chat is disabled. Add ${aiProvider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} to .env to enable it.`);
  if (!googleClientId || !googleClientSecret) console.log("Google sign-in is disabled until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.");
  if (!facebookAppId || !facebookAppSecret) console.log("Facebook sign-in is disabled until FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are set.");
});
