const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'project.db');

let db = null;

function initDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (db) return db;

  db = new Database(DB_PATH);
  
  // 基础性能与稳定性配置
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // 初始化表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS runninghub_tasks (
      id TEXT PRIMARY KEY,
      remote_task_id TEXT,
      provider TEXT,
      type TEXT,
      source_node_id TEXT,
      prompt TEXT,
      status TEXT,
      output_url TEXT,
      error TEXT,
      raw_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT,
      value_json TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS app_kv (
      key TEXT PRIMARY KEY,
      value_json TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT
    );
  `);

  console.log(`[SQLite] Database initialized at: ${DB_PATH}`);
  return db;
}

function getDb() {
  if (!db) return initDb();
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// --- Task 方法 ---
function upsertTask(task) {
  const _db = getDb();
  const now = new Date().toISOString();
  const stmt = _db.prepare(`
    INSERT INTO runninghub_tasks (id, remote_task_id, provider, type, source_node_id, prompt, status, output_url, error, raw_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      remote_task_id = excluded.remote_task_id,
      status = excluded.status,
      output_url = excluded.output_url,
      error = excluded.error,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    String(task.id),
    task.remote_task_id || task.runninghubTaskId || null,
    task.provider || null,
    task.type || null,
    task.source_node_id || task.sourceNodeId || null,
    task.prompt || null,
    task.status || null,
    task.output_url || task.resultFileUrl || null,
    task.error || task.errorMessage || null,
    typeof task.raw_json === 'object' ? JSON.stringify(task.raw_json) : (task.raw_json || null),
    task.created_at || task.createdAt || now,
    now
  );
}

function getTask(id) {
  const _db = getDb();
  const row = _db.prepare('SELECT * FROM runninghub_tasks WHERE id = ?').get(String(id));
  if (!row) return null;
  try { row.raw_json = row.raw_json ? JSON.parse(row.raw_json) : null; } catch(e) {}
  return row;
}

function listTasks(limit = 100) {
  const _db = getDb();
  const rows = _db.prepare('SELECT * FROM runninghub_tasks ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map(row => {
    try { row.raw_json = row.raw_json ? JSON.parse(row.raw_json) : null; } catch(e) {}
    return row;
  });
}

function updateTask(id, patch) {
  const _db = getDb();
  const now = new Date().toISOString();
  const fields = Object.keys(patch);
  if (fields.length === 0) return;

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => {
    const val = patch[f];
    return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
  });
  values.push(now, String(id));

  _db.prepare(`UPDATE runninghub_tasks SET ${sets}, updated_at = ? WHERE id = ?`).run(...values);
}

// --- Settings 方法 ---
function setSetting(key, value) {
  const _db = getDb();
  const now = new Date().toISOString();
  _db.prepare(`
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);
}

function getSetting(key) {
  const _db = getDb();
  const row = _db.prepare('SELECT value_json FROM app_settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value_json); } catch(e) { return row.value_json; }
}

// --- Workflow 方法 ---
function saveWorkflow(wf) {
  const _db = getDb();
  const now = new Date().toISOString();
  _db.prepare(`
    INSERT INTO workflows (id, name, value_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(wf.id, wf.name, JSON.stringify(wf.settings || wf), wf.created_at || wf.createdAt || now, now);
}

function getWorkflow(id) {
  const _db = getDb();
  const row = _db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  if (!row) return null;
  try { row.value_json = JSON.parse(row.value_json); } catch(e) {}
  return row;
}

function listWorkflows() {
  const _db = getDb();
  const rows = _db.prepare('SELECT * FROM workflows ORDER BY updated_at DESC').all();
  return rows.map(row => {
    try { row.value_json = JSON.parse(row.value_json); } catch(e) {}
    return row;
  });
}

// --- KV 方法 ---
function setKv(key, value) {
  const _db = getDb();
  const now = new Date().toISOString();
  _db.prepare(`
    INSERT INTO app_kv (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);
}

function getKv(key) {
  const _db = getDb();
  const row = _db.prepare('SELECT value_json FROM app_kv WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value_json); } catch(e) { return row.value_json; }
}

module.exports = {
  initDb,
  getDb,
  closeDb,
  upsertTask,
  getTask,
  listTasks,
  updateTask,
  setSetting,
  getSetting,
  saveWorkflow,
  getWorkflow,
  listWorkflows,
  setKv,
  getKv
};
