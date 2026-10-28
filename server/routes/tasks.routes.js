import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireCsrf } from "../auth.js";

const router = Router();

export function validateTaskText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= 140 ? text : null;
}

export function makeTaskRow(task) {
  return {
    id: task.id,
    text: task.text,
    completed: Boolean(task.completed),
    dueDate: task.due_date || null,
    priority: task.priority || "none",
    createdAt: task.created_at,
  };
}

export function tasksForUser(userId) {
  return db
    .prepare("SELECT id, text, completed, due_date, priority, created_at FROM tasks WHERE user_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(userId)
    .map(makeTaskRow);
}

export function addUserTask(userId, text, { dueDate = null, priority = "none" } = {}) {
  const validPriority = ["low", "medium", "high"].includes(priority) ? priority : "none";
  const validDueDate = typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : null;
  const task = {
    id: randomBytes(16).toString("hex"),
    text,
    dueDate: validDueDate,
    priority: validPriority,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO tasks (id, user_id, text, completed, due_date, priority, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)").run(
    task.id,
    userId,
    task.text,
    task.dueDate,
    task.priority,
    task.createdAt,
  );
  return { ...task, completed: false };
}

router.get("/api/tasks", requireAuth, (req, res) => {
  res.json({ tasks: tasksForUser(req.user.id) });
});

router.post("/api/tasks", requireAuth, requireCsrf, (req, res) => {
  const text = validateTaskText(req.body?.text);
  if (!text) return res.status(400).json({ error: "Tasks must contain 1–140 characters." });
  const dueDate = typeof req.body?.dueDate === "string" ? req.body.dueDate : null;
  const priority = typeof req.body?.priority === "string" ? req.body.priority : "none";
  res.status(201).json({ task: addUserTask(req.user.id, text, { dueDate, priority }) });
});

router.patch("/api/tasks/:id", requireAuth, requireCsrf, (req, res) => {
  const updates = [];
  const params = [];

  if (typeof req.body?.completed === "boolean") {
    updates.push("completed = ?");
    params.push(Number(req.body.completed));
  }
  if (typeof req.body?.text !== "undefined") {
    const text = validateTaskText(req.body.text);
    if (!text) return res.status(400).json({ error: "Tasks must contain 1–140 characters." });
    updates.push("text = ?");
    params.push(text);
  }
  if (typeof req.body?.dueDate !== "undefined") {
    const dueDate = typeof req.body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate) ? req.body.dueDate : null;
    updates.push("due_date = ?");
    params.push(dueDate);
  }
  if (typeof req.body?.priority !== "undefined") {
    const priority = ["low", "medium", "high"].includes(req.body.priority) ? req.body.priority : "none";
    updates.push("priority = ?");
    params.push(priority);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No valid task updates provided." });
  }

  params.push(req.params.id, req.user.id);
  const result = db.prepare(`UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);
  if (result.changes === 0) return res.status(404).json({ error: "Task not found." });

  const updated = db.prepare("SELECT id, text, completed, due_date, priority, created_at FROM tasks WHERE id = ?").get(req.params.id);
  res.json({ ok: true, task: updated ? makeTaskRow(updated) : null });
});

router.delete("/api/tasks/:id", requireAuth, requireCsrf, (req, res) => {
  const result = db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: "Task not found." });
  res.status(204).end();
});

router.delete("/api/tasks/completed", requireAuth, requireCsrf, (req, res) => {
  const result = db.prepare("DELETE FROM tasks WHERE user_id = ? AND completed = 1").run(req.user.id);
  res.json({ deleted: result.changes });
});

export default router;
