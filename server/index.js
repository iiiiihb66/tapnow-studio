// server/index.js
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'runninghub-db.json');
const ENV_FILES = ['.env.local', '.env'];
const PORT = Number(process.env.PORT || 3001);
const RUNNINGHUB_HOST = 'https://www.runninghub.cn';

function loadEnvFiles() {
  const rootDir = path.join(__dirname, '..');
  for (const name of ENV_FILES) {
    const fileInServer = path.join(__dirname, name);
    const fileInRoot = path.join(rootDir, name);
    const file = fs.existsSync(fileInRoot) ? fileInRoot : fileInServer;
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\' '))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadEnvFiles();
ensureDb();

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ tasks: [], settings: {}, workflows: [], createdAt: new Date().toISOString() }, null, 2), 'utf-8');
  }
}

function readDb() {
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!Array.isArray(db.tasks)) db.tasks = [];
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (!Array.isArray(db.workflows)) db.workflows = [];
  if (typeof db.activeWorkflowId !== 'string') db.activeWorkflowId = '';
  ensureWorkflowCollection(db);
  return db;
}
function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}
function nowIso() { return new Date().toISOString(); }
function nextId(items) { return items.length ? Math.max(...items.map(i => Number(i.id) || 0)) + 1 : 1; }
function makeWorkflowRecordId() { return `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function getApiKey() { return process.env.RUNNINGHUB_API_KEY || ''; }
function getDefaultWorkflowId() { return process.env.RUNNINGHUB_DEFAULT_WORKFLOW_ID || ''; }
function authHeaders() { const apiKey = getApiKey(); return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}; }
function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('imageBase64 必须是 data URL（例如 data:image/png;base64,...）');
  const [, mimeType, base64] = match;
  return { mimeType, buffer: Buffer.from(base64, 'base64') };
}
function extractWorkflowId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return raw;
  const longNumber = raw.match(/(\d{8,})/g);
  return longNumber?.[longNumber.length - 1] || '';
}
function sanitizeExtraFields(extraFields = []) {
  return (Array.isArray(extraFields) ? extraFields : []).map((field, index) => ({
    key: String(field?.key || `extra_${index + 1}`).trim(),
    label: String(field?.label || field?.key || `扩展字段 ${index + 1}`).trim(),
    nodeId: String(field?.nodeId || '').trim(),
    fieldName: String(field?.fieldName || '').trim(),
    required: Boolean(field?.required),
    defaultValue: String(field?.defaultValue ?? '').trim(),
    placeholder: String(field?.placeholder ?? '').trim(),
  }));
}
function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}
function normalizeSettings(input = {}, db) {
  const saved = db?.settings || {};
  const workflowUrl = firstNonEmptyString(input.workflowUrl, saved.workflowUrl);
  const workflowId = extractWorkflowId(input.workflowId || workflowUrl || saved.workflowId || getDefaultWorkflowId());
  const workflowName = firstNonEmptyString(input.workflowName, saved.workflowName, '未命名工作流') || '未命名工作流';
  const inferredImageMapping = inferImageMappingFromHistory(db, workflowId);
  const fileNodeId = firstNonEmptyString(input.fileNodeId, saved.fileNodeId, inferredImageMapping.fileNodeId);
  const fileFieldName = firstNonEmptyString(input.fileFieldName, saved.fileFieldName, inferredImageMapping.fileFieldName, 'image') || 'image';
  const promptNodeId = firstNonEmptyString(input.promptNodeId, saved.promptNodeId);
  const promptFieldName = firstNonEmptyString(input.promptFieldName, saved.promptFieldName, 'text') || 'text';
  const promptRequired = Boolean(input.promptRequired ?? saved.promptRequired ?? false);
  const defaultPrompt = firstNonEmptyString(input.defaultPrompt, saved.defaultPrompt);
  const extraFields = sanitizeExtraFields(input.extraFields ?? saved.extraFields ?? []);
  return { workflowName, workflowUrl, workflowId, fileNodeId, fileFieldName, promptNodeId, promptFieldName, promptRequired, defaultPrompt, extraFields };
}
function normalizeWorkflowRecord(input = {}) {
  const workflowUrl = String(input.workflowUrl ?? '').trim();
  const workflowId = extractWorkflowId(input.workflowId || workflowUrl);
  const workflowName = String(input.workflowName ?? '未命名工作流').trim() || '未命名工作流';
  const fileNodeId = String(input.fileNodeId ?? '').trim();
  const fileFieldName = String(input.fileFieldName ?? 'image').trim() || 'image';
  const promptNodeId = String(input.promptNodeId ?? '').trim();
  const promptFieldName = String(input.promptFieldName ?? 'text').trim() || 'text';
  const promptRequired = Boolean(input.promptRequired ?? false);
  const defaultPrompt = String(input.defaultPrompt ?? '').trim();
  const extraFields = sanitizeExtraFields(input.extraFields ?? []);
  return { workflowName, workflowUrl, workflowId, fileNodeId, fileFieldName, promptNodeId, promptFieldName, promptRequired, defaultPrompt, extraFields };
}
function inferImageMappingFromHistory(db, workflowId) {
  const targetWorkflowId = String(workflowId || '').trim();
  if (!targetWorkflowId) return { fileNodeId: '', fileFieldName: 'image' };
  for (const task of db?.tasks || []) {
    if (String(task?.workflowId || '').trim() !== targetWorkflowId) continue;
    const directNodeId = String(task?.fileNodeId || task?.settings?.fileNodeId || '').trim();
    const directFieldName = String(task?.fileFieldName || task?.settings?.fileFieldName || '').trim();
    if (directNodeId) {
      return { fileNodeId: directNodeId, fileFieldName: directFieldName || 'image' };
    }
    const firstImageNode = Array.isArray(task?.nodeInfoList)
      ? task.nodeInfoList.find(item => String(item?.fieldName || '').trim())
      : null;
    if (firstImageNode?.nodeId) {
      return { fileNodeId: String(firstImageNode.nodeId).trim(), fileFieldName: String(firstImageNode.fieldName || 'image').trim() || 'image' };
    }
  }
  return { fileNodeId: '', fileFieldName: 'image' };
}
function validateSettings(settings) {
  const errors = [];
  if (!settings.workflowId) errors.push('缺少 workflowId（可直接粘贴工作流链接，系统会自动提取）');
  if (!settings.fileNodeId) errors.push('缺少图片输入节点 fileNodeId');
  if (!settings.fileFieldName) errors.push('缺少图片输入字段 fileFieldName');
  if ((settings.promptNodeId && !settings.promptFieldName) || (!settings.promptNodeId && settings.promptRequired)) {
    errors.push('Prompt 已启用但 prompt 节点映射不完整，请补充 promptNodeId / promptFieldName');
  }
  const keySet = new Set();
  for (const field of settings.extraFields) {
    if (!field.key) errors.push('存在未命名的扩展字段，请填写 key');
    if (field.key && keySet.has(field.key)) errors.push(`扩展字段 key 重复：${field.key}`);
    keySet.add(field.key);
    if (!field.nodeId) errors.push(`扩展字段「${field.label || field.key}」缺少 nodeId`);
    if (!field.fieldName) errors.push(`扩展字段「${field.label || field.key}」缺少 fieldName`);
  }
  return errors;
}
function validateRuntimePayload({ settings, imageBase64, prompt, extraFieldValues = {} }) {
  const errors = [];
  if (!imageBase64) errors.push('请先上传图片');
  if (settings.promptRequired && !String(prompt || '').trim()) errors.push('当前工作流要求填写 Prompt');
  for (const field of settings.extraFields) {
    const value = String(extraFieldValues?.[field.key] ?? field.defaultValue ?? '').trim();
    if (field.required && !value) {
      errors.push(`请填写必填项：${field.label || field.key}`);
    }
  }
  return errors;
}
async function runninghubFetch(pathname, options = {}) {
  const response = await fetch(`${RUNNINGHUB_HOST}${pathname}`, options);
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!response.ok) {
    const message = json?.msg || json?.message || `RunningHub HTTP ${response.status}`;
    throw new Error(message);
  }
  return json;
}
async function uploadFileToRunningHub({ dataUrl, filename }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('服务端未配置 RUNNINGHUB_API_KEY');
  const { mimeType, buffer } = parseDataUrl(dataUrl);
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  form.append('file', blob, filename || `upload.${mimeType.split('/')[1] || 'png'}`);
  return runninghubFetch('/openapi/v2/media/upload/binary', { method: 'POST', headers: { ...authHeaders() }, body: form });
}
async function createWorkflowTask({ workflowId, nodeInfoList }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('服务端未配置 RUNNINGHUB_API_KEY');
  return runninghubFetch('/task/openapi/create', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ apiKey, workflowId, nodeInfoList }) });
}
async function queryTaskStatus(taskId) {
  const apiKey = getApiKey();
  return runninghubFetch('/task/openapi/status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ apiKey, taskId }) });
}
async function queryTaskOutputs(taskId) {
  const apiKey = getApiKey();
  return runninghubFetch('/task/openapi/outputs', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ apiKey, taskId }) });
}
function normalizeRemoteStatus(value) {
  if (value === 'SUCCESS') return 'SUCCESS';
  if (value === 'FAILED') return 'FAILED';
  if (value === 'RUNNING') return 'RUNNING';
  if (value === 'QUEUED') return 'QUEUED';
  return 'UNKNOWN';
}
async function syncTask(localTask) {
  if (!localTask?.runninghubTaskId) return localTask;
  if (['SUCCESS', 'FAILED'].includes(localTask.status)) return localTask;
  const statusRes = await queryTaskStatus(localTask.runninghubTaskId);
  const remoteStatus = normalizeRemoteStatus(statusRes?.data);
  localTask.status = remoteStatus;
  localTask.lastSyncedAt = nowIso();
  localTask.remoteStatusRaw = statusRes?.data || '';
  localTask.remoteMessage = statusRes?.msg || '';
  if (remoteStatus === 'SUCCESS') {
    const outputRes = await queryTaskOutputs(localTask.runninghubTaskId);
    localTask.resultFiles = outputRes?.data || [];
    localTask.resultFileUrl = outputRes?.data?.[0]?.fileUrl || '';
    localTask.consumeCoins = outputRes?.data?.[0]?.consumeCoins || '';
    localTask.taskCostTime = outputRes?.data?.[0]?.taskCostTime || '';
    localTask.completedAt = nowIso();
  }
  if (remoteStatus === 'FAILED') {
    localTask.errorMessage = statusRes?.msg || 'RunningHub 任务失败';
    localTask.completedAt = nowIso();
  }
  return localTask;
}
function toClientTask(task) {
  return {
    id: task.id,
    workflowName: task.workflowName,
    workflowId: task.workflowId,
    status: task.status,
    runninghubTaskId: task.runninghubTaskId,
    prompt: task.prompt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    lastSyncedAt: task.lastSyncedAt,
    completedAt: task.completedAt,
    resultFiles: task.resultFiles || [],
    resultFileUrl: task.resultFileUrl || '',
    consumeCoins: task.consumeCoins || '',
    taskCostTime: task.taskCostTime || '',
    errorMessage: task.errorMessage || '',
    fileName: task.uploadedFileName || '',
    inputFilename: task.inputFilename || '',
  };
}
function toClientWorkflow(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    workflowId: workflow.settings?.workflowId || '',
    settings: workflow.settings,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    source: workflow.source || 'manual',
  };
}
function ensureWorkflowCollection(db) {
  if (!Array.isArray(db.workflows)) db.workflows = [];
  if (db.workflows.length === 0) {
    const seeded = [];
    const seen = new Set();
    const currentSettings = normalizeSettings(db.settings || {}, db);
    if (currentSettings.workflowId) {
      const key = `${currentSettings.workflowId}:${currentSettings.workflowName}`;
      if (!seen.has(key)) {
        seeded.push({ id: makeWorkflowRecordId(), name: currentSettings.workflowName, settings: currentSettings, createdAt: nowIso(), updatedAt: nowIso(), source: 'settings' });
        seen.add(key);
      }
    }
    for (const task of db.tasks || []) {
      const taskSettings = normalizeWorkflowRecord(task.settings || task);
      if (!taskSettings.workflowId) continue;
      const key = `${taskSettings.workflowId}:${taskSettings.workflowName}`;
      if (seen.has(key)) continue;
      seeded.push({ id: makeWorkflowRecordId(), name: taskSettings.workflowName, settings: taskSettings, createdAt: task.createdAt || nowIso(), updatedAt: task.updatedAt || task.createdAt || nowIso(), source: 'task-history' });
      seen.add(key);
    }
    db.workflows = seeded;
  }
  if (!db.activeWorkflowId && db.workflows[0]?.id) {
    db.activeWorkflowId = db.workflows[0].id;
  }
  const active = db.workflows.find(item => item.id === db.activeWorkflowId);
  if (active?.settings) {
    db.settings = normalizeSettings(active.settings, db);
  }
}
function upsertWorkflow(db, settings, preferredName = '') {
  const workflowName = String(preferredName || settings.workflowName || '未命名工作流').trim() || '未命名工作流';
  const key = String(settings.workflowId || '').trim();
  const existing = db.workflows.find(item => String(item.settings?.workflowId) === key && String(item.name) === workflowName);
  const timestamp = nowIso();
  if (existing) {
    existing.name = workflowName;
    existing.settings = normalizeWorkflowRecord({ ...existing.settings, ...settings, workflowName });
    existing.updatedAt = timestamp;
    return existing;
  }
  const record = { id: makeWorkflowRecordId(), name: workflowName, settings: normalizeWorkflowRecord({ ...settings, workflowName }), createdAt: timestamp, updatedAt: timestamp, source: 'manual' };
  db.workflows.unshift(record);
  return record;
}
function humanizeRunningHubError(error, settings = {}) {
  const message = String(error instanceof Error ? error.message : error || '').trim();
  if (message.includes('NODE_INFO_MISMATCH')) {
    return `这个工作流还没有完成接入：当前填写的输入映射和工作流真实节点不匹配。\n\n本次使用的配置：图片节点 ${settings.fileNodeId || '-'} / ${settings.fileFieldName || '-'}，Prompt 节点 ${settings.promptNodeId || '-'} / ${settings.promptFieldName || '-'}。\n\n这不是你日常使用时该处理的问题，而是“首次接入工作流”时要完成的一次性配置。请切到“接入工作流”页修正后再用。`;
  }
  return message;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'runninghub-mvp-api' }));

app.get('/api/runninghub/config', (_req, res) => {
  const db = readDb();
  const settings = normalizeSettings(db.settings, db);
  db.settings = settings;
  writeDb(db);
  res.json({ ok: true, hasApiKey: Boolean(getApiKey()), defaultWorkflowId: getDefaultWorkflowId(), settings, workflows: db.workflows.map(toClientWorkflow), activeWorkflowId: db.activeWorkflowId || '', validationErrors: validateSettings(settings) });
});

app.post('/api/runninghub/config', (req, res) => {
  const db = readDb();
  const settings = normalizeSettings(req.body || {}, db);
  const validationErrors = validateSettings(settings);
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0], validationErrors, settings });
  }
  db.settings = settings;
  db.updatedAt = nowIso();
  writeDb(db);
  return res.json({ ok: true, message: '当前工作流设置已保存，立即生效，无需重启后端。', settings, workflows: db.workflows.map(toClientWorkflow), activeWorkflowId: db.activeWorkflowId || '' });
});

app.post('/api/runninghub/workflows', (req, res) => {
  const db = readDb();
  const settings = normalizeSettings(req.body?.settings || req.body || {}, db);
  const validationErrors = validateSettings(settings);
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0], validationErrors, settings });
  }
  const workflow = upsertWorkflow(db, settings, req.body?.name || settings.workflowName);
  db.activeWorkflowId = workflow.id;
  db.settings = normalizeSettings(workflow.settings, db);
  db.updatedAt = nowIso();
  writeDb(db);
  return res.json({ ok: true, message: `工作流「${workflow.name}」已保存，可随时切换测试。`, workflow: toClientWorkflow(workflow), workflows: db.workflows.map(toClientWorkflow), activeWorkflowId: db.activeWorkflowId, settings: db.settings });
});

app.post('/api/runninghub/workflows/:id/activate', (req, res) => {
  const db = readDb();
  const workflow = db.workflows.find(item => item.id === req.params.id);
  if (!workflow) return res.status(404).json({ error: '工作流不存在' });
  db.activeWorkflowId = workflow.id;
  db.settings = normalizeSettings(workflow.settings, db);
  db.updatedAt = nowIso();
  writeDb(db);
  return res.json({ ok: true, message: `已切换到工作流「${workflow.name}」`, activeWorkflowId: workflow.id, settings: db.settings, workflows: db.workflows.map(toClientWorkflow) });
});

app.delete('/api/runninghub/workflows/:id', (req, res) => {
  const db = readDb();
  const index = db.workflows.findIndex(item => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '工作流不存在' });
  const [removed] = db.workflows.splice(index, 1);
  if (db.activeWorkflowId === removed.id) {
    db.activeWorkflowId = db.workflows[0]?.id || '';
    db.settings = db.activeWorkflowId ? normalizeSettings(db.workflows.find(item => item.id === db.activeWorkflowId)?.settings || {}, db) : {};
  }
  db.updatedAt = nowIso();
  writeDb(db);
  return res.json({ ok: true, message: `已删除工作流「${removed.name}」`, workflows: db.workflows.map(toClientWorkflow), activeWorkflowId: db.activeWorkflowId || '', settings: db.settings });
});

app.post('/api/runninghub/config/validate', (req, res) => {
  const db = readDb();
  const settings = normalizeSettings(req.body?.settings || req.body || {}, db);
  const validationErrors = validateSettings(settings);
  const runtimeErrors = validateRuntimePayload({ settings, imageBase64: req.body?.imageBase64, prompt: req.body?.prompt, extraFieldValues: req.body?.extraFieldValues });
  return res.json({ ok: validationErrors.length === 0 && runtimeErrors.length === 0, settings, validationErrors, runtimeErrors });
});

app.get('/api/runninghub/tasks', (_req, res) => {
  const db = readDb();
  const tasks = db.tasks.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ tasks: tasks.map(toClientTask) });
});

app.get('/api/runninghub/tasks/:id', async (req, res) => {
  const db = readDb();
  const task = db.tasks.find(item => String(item.id) === String(req.params.id));
  if (!task) return res.status(404).json({ error: '任务不存在' });
  try {
    await syncTask(task);
    task.updatedAt = nowIso();
    writeDb(db);
    return res.json({ task: toClientTask(task) });
  } catch (error) {
    task.updatedAt = nowIso();
    task.errorMessage = error instanceof Error ? error.message : '同步任务失败';
    writeDb(db);
    return res.status(500).json({ error: task.errorMessage, task: toClientTask(task) });
  }
});

app.post('/api/runninghub/tasks', async (req, res) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(400).json({ error: '服务端未配置 RUNNINGHUB_API_KEY，请先在 runninghub-mvp/.env.local 中设置' });
  }
  const db = readDb();
  const settings = normalizeSettings(req.body?.settings || req.body || {}, db);
  const validationErrors = validateSettings(settings);
  if (validationErrors.length) {
    return res.status(400).json({ error: validationErrors[0], validationErrors });
  }
  const { prompt = '', imageBase64, imageFilename, extraFieldValues = {} } = req.body || {};
  const runtimeErrors = validateRuntimePayload({ settings, imageBase64, prompt, extraFieldValues });
  if (runtimeErrors.length) {
    return res.status(400).json({ error: runtimeErrors[0], runtimeErrors });
  }
  try {
    const uploadRes = await uploadFileToRunningHub({ dataUrl: imageBase64, filename: imageFilename });
    const uploadedFileName = uploadRes?.data?.fileName;
    if (!uploadedFileName) throw new Error(uploadRes?.message || '上传成功但未返回 fileName');
    const nodeInfoList = [{ nodeId: String(settings.fileNodeId), fieldName: String(settings.fileFieldName), fieldValue: String(uploadedFileName) }];
    if (settings.promptNodeId && String(prompt).trim()) {
      nodeInfoList.push({ nodeId: String(settings.promptNodeId), fieldName: String(settings.promptFieldName), fieldValue: String(prompt) });
    }
    for (const field of settings.extraFields) {
      const value = String(extraFieldValues?.[field.key] ?? field.defaultValue ?? '').trim();
      if (!value) continue;
      nodeInfoList.push({ nodeId: String(field.nodeId), fieldName: String(field.fieldName), fieldValue: value });
    }
    const createRes = await createWorkflowTask({ workflowId: settings.workflowId, nodeInfoList });
    if (createRes?.code !== 0) throw new Error(createRes?.msg || '创建任务失败');
    const runninghubTaskId = createRes?.data?.taskId;
    if (!runninghubTaskId) throw new Error('RunningHub 未返回 taskId');
    const task = { id: nextId(db.tasks), workflowId: String(settings.workflowId), workflowName: settings.workflowName || '未命名工作流', status: 'QUEUED', runninghubTaskId: String(runninghubTaskId), prompt: String(prompt || ''), inputFilename: imageFilename || '', uploadedFileName, nodeInfoList, settings, resultFiles: [], resultFileUrl: '', consumeCoins: '', taskCostTime: '', errorMessage: '', createdAt: nowIso(), updatedAt: nowIso(), lastSyncedAt: '', completedAt: '' };
    db.tasks.push(task);
    writeDb(db);
    return res.json({ ok: true, task: toClientTask(task) });
  } catch (error) {
    return res.status(500).json({ error: humanizeRunningHubError(error, settings) });
  }
});

// ==== Ollama 云端 API ==== 
// 统一的请求函数，自动带上 Authorization
async function ollamaFetch(path, body) {
  const base = process.env.OLLAMA_BASE_URL || 'https://api.ollama.com/v1';
  const apiKey = (process.env.OLLAMA_API_KEY || '').trim();
  if (!apiKey) throw new Error('缺少 OLLAMA_API_KEY 环境变量');
  const fullUrl = `${base}${path}`;
  console.log(`[Ollama Proxy] POST ${fullUrl}`);
  
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  let json;
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = { raw: txt }; }

  if (!res.ok) {
    console.error(`[Ollama Error] ${res.status} ${res.statusText}:`, txt);
    const msg = json?.error?.message || json?.error || txt || `Ollama HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// 1. 文本对话 / 意图理解
app.post('/api/ollama/chat', async (req, res) => {
  try {
    const { prompt, history = [] } = req.body || {};
    const model = process.env.OLLAMA_TEXT_MODEL || 'llama3';
    // 清理并确保历史记录严格交替 (Ollama Cloud API 要求)
    let cleanHistory = history.filter(m => !m.content.includes('❌ 错误'));
    let finalMessages = [];
    
    // 构建以 user 结尾的交替数组
    let allMsgs = [...cleanHistory, { role: 'user', content: prompt }];
    for (let i = allMsgs.length - 1; i >= 0; i--) {
      const msg = allMsgs[i];
      if (finalMessages.length === 0) {
        if (msg.role === 'user') finalMessages.unshift(msg);
      } else {
        const firstAdded = finalMessages[0];
        if (msg.role !== firstAdded.role) {
          finalMessages.unshift(msg);
        } else {
          // 合并同角色的连续消息
          finalMessages[0] = { ...finalMessages[0], content: msg.content + '\n' + finalMessages[0].content };
        }
      }
    }
    // 如果第一条是 assistant，则丢弃它，确保必须以 user 开头
    if (finalMessages.length > 0 && finalMessages[0].role === 'assistant') {
      finalMessages.shift();
    }

    const result = await ollamaFetch('/chat/completions', {
      model,
      messages: finalMessages,
    });
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 2. 文本生成图片
app.post('/api/ollama/generate-image', async (req, res) => {
  try {
    const { prompt, width = 512, height = 512 } = req.body || {};
    const model = process.env.OLLAMA_IMAGE_MODEL || 'flux-dev';
    const result = await ollamaFetch('/images/generations', {
      model,
      prompt,
      width,
      height,
    });
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 3. 获取模型列表（可选）
app.get('/api/ollama/models', async (_, res) => {
  try {
    const result = await ollamaFetch('/models', {});
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => console.log(`runninghub api listening on http://localhost:${PORT}`));
