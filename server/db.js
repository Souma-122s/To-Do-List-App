import "./config.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import session from "express-session";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

export const REMEMBERED_SESSION_MS = 1000 * 60 * 60 * 24 * 30;

export const db = new Database(path.join(projectRoot, "daylight.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 140),
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS linked_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK(provider IN ('google', 'facebook')),
    provider_id TEXT NOT NULL,
    email TEXT,
    display_name TEXT NOT NULL,
    linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id),
    UNIQUE(user_id, provider)
  );
`);

// Ensure tasks table has due_date and priority columns (backward-compatible migration)
const taskCols = db.prepare("PRAGMA table_info(tasks)").all();
if (!taskCols.some((col) => col.name === "due_date")) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT");
}
if (!taskCols.some((col) => col.name === "priority")) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'");
}

for (const user of db.prepare("SELECT id, email, display_name, provider, provider_id FROM users WHERE provider IN ('google', 'facebook')").all()) {
  db.prepare("INSERT OR IGNORE INTO linked_accounts (user_id, provider, provider_id, email, display_name) VALUES (?, ?, ?, ?, ?)")
    .run(user.id, user.provider, user.provider_id, user.email, user.display_name);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expired_idx ON sessions(expired);

  CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON ai_conversations(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    content_html TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON ai_messages(conversation_id, id ASC);
`);

// Ensure ai_conversations table has is_pinned column
const aiConvCols = db.prepare("PRAGMA table_info(ai_conversations)").all();
if (!aiConvCols.some((col) => col.name === "is_pinned")) {
  db.exec("ALTER TABLE ai_conversations ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
}
db.exec("CREATE INDEX IF NOT EXISTS ai_conversations_user_pin_idx ON ai_conversations(user_id, is_pinned DESC, updated_at DESC);");

// Session Store
export class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare("SELECT sess, expired FROM sessions WHERE sid = ?").get(sid);
      if (!row) return callback(null, null);
      if (row.expired <= Date.now()) {
        db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) { callback(error); }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + Number(sess.cookie?.maxAge || REMEMBERED_SESSION_MS);
      db.prepare("INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired")
        .run(sid, JSON.stringify(sess), expires);
      callback(null);
    } catch (error) { callback(error); }
  }

  touch(sid, sess, callback = () => {}) { this.set(sid, sess, callback); }

  destroy(sid, callback = () => {}) {
    try { db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid); callback(null); }
    catch (error) { callback(error); }
  }

  clear(callback = () => {}) {
    try { db.prepare("DELETE FROM sessions").run(); callback(null); }
    catch (error) { callback(error); }
  }

  length(callback) {
    try { callback(null, db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expired > ?").get(Date.now()).count); }
    catch (error) { callback(error); }
  }

  all(callback) {
    try {
      const rows = db.prepare("SELECT sess FROM sessions WHERE expired > ?").all(Date.now());
      callback(null, rows.map((row) => JSON.parse(row.sess)));
    } catch (error) { callback(error); }
  }
}

// Clean up expired sessions periodically (every hour)
setInterval(() => {
  try {
    db.prepare("DELETE FROM sessions WHERE expired <= ?").run(Date.now());
  } catch (err) {
    console.error("Session cleanup error:", err.message);
  }
}, 1000 * 60 * 60).unref();
