# Daylight

Daylight is a personal to-do app with per-account task storage, email/password accounts, optional Google and Facebook sign-in, and a conversational AI planning assistant. The browser never receives the AI provider key: AI requests are made by the server.

## Run locally

1. Install Node.js 20 or later.
2. In this folder, install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set `SESSION_SECRET` to a random string of 32 or more characters. To generate one in Node, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. To test Gemini, set `AI_PROVIDER=gemini` and add your key to `GEMINI_API_KEY` in `.env`. The default model is `gemini-3.5-flash-lite`; change `GEMINI_MODEL` if needed. To use OpenAI instead, set `AI_PROVIDER=openai` and configure `OPENAI_API_KEY`. Without a provider key, account/task features still work; AI requests show a setup message.
5. Run `npm start`, then open `http://localhost:3000` (do not open `index.html` directly as a file).

Gemini's unpaid tier may use prompts and replies to improve Google products and may involve human review, so do not send sensitive or personal information through it. Its terms also require API users to be 18+ and restrict apps likely to be accessed by people under 18; review the current [Gemini API terms](https://ai.google.dev/gemini-api/terms) before using it beyond private testing. Keep provider keys only in `.env`; never put them in browser code or commit them.

The email login includes **Remember me**: when selected, the server creates a 30-day persistent session. Without it, the login lasts only for the current browser session. This stores the sign-in session, not the password; passwords remain bcrypt-hashed on the server.

## Optional social sign-in

The email/password Daylight account is available without configuring social providers. OAuth apps are provider-specific and need credentials from their developer portals; do not put credentials in frontend files.

- **Google:** Create an OAuth 2.0 Web application in Google Cloud Console, add `http://localhost:3000/auth/google/callback` as an authorized redirect URI, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
- **Facebook:** Create an app in Meta for Developers, add Facebook Login and the callback `http://localhost:3000/auth/facebook/callback` to its valid OAuth redirect URIs, then set `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` in `.env`. Provider review or test-user settings may be required.

Restart the server after changing `.env`. Google and Facebook options remain visible below the email login form; when a provider is not configured, tapping it explains that email sign-in is available instead.

## Deployment

Use HTTPS in production and set `NODE_ENV=production`, a secure `SESSION_SECRET`, and provider callback URLs to the deployed HTTPS origin. Keep `.env`, `daylight.sqlite`, and `sessions.sqlite` private and backed up; use durable storage. Set `OPENAI_API_KEY` only on the server. Review AI-generated tasks before relying on them.
