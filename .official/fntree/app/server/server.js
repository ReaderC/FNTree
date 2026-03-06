'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { URL } = require('url');

const APP_ROOT = process.env.TRIM_APPDEST || path.resolve(__dirname, '..');
const UI_ROOT = path.join(APP_ROOT, 'ui');
const DATA_ROOT = process.env.TRIM_PKGVAR || path.join(APP_ROOT, '..', 'var');
const TEMP_ROOT = process.env.TRIM_PKGTMP || path.join(APP_ROOT, '..', 'tmp');
const SETTINGS_FILE = path.join(DATA_ROOT, 'settings.json');
const TASKS_FILE = path.join(DATA_ROOT, 'tasks.json');
const PORT = Number(process.env.PORT || process.env.TRIM_SERVICE_PORT || 37125);
const GDU_BINARY = process.env.GDU_BIN || path.join(APP_ROOT, 'bin', 'gdu');
const GDU_MOCK_FILE = process.env.GDU_MOCK_FILE || '';
const TASK_RETENTION_MS = 6 * 60 * 60 * 1000;

const tasks = new Map();

ensureDir(DATA_ROOT);
ensureDir(TEMP_ROOT);
loadPersistedTasks();
syncSettingsFromEnv();
purgeExpiredTasks();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(res, url.pathname);
  } catch (error) {
    writeJson(res, 500, {
      error: 'internal_error',
      message: error.message,
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(`server listening on ${PORT}`);
});

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(path.join(DATA_ROOT, 'server.log'), line);
  } catch (_) {
    // Ignore log failures to avoid breaking the service.
  }
}

function loadPersistedTasks() {
  if (!fs.existsSync(TASKS_FILE)) {
    return;
  }

  try {
    const content = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    for (const task of content) {
      tasks.set(task.id, task);
    }
  } catch (error) {
    log(`failed to load tasks: ${error.message}`);
  }
}

function persistTasks() {
  const serializable = Array.from(tasks.values()).map((task) => ({
    ...task,
    process: undefined,
  }));
  fs.writeFileSync(TASKS_FILE, JSON.stringify(serializable, null, 2));
}

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return defaultSettings();
  }

  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
  } catch {
    return defaultSettings();
  }
}

function writeSettings(nextSettings) {
  const normalized = normalizeSettings(nextSettings);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function syncSettingsFromEnv() {
  const envPaths = splitPaths(process.env.TRIM_DATA_ACCESSIBLE_PATHS || '');
  if (!envPaths.length && fs.existsSync(SETTINGS_FILE)) {
    return;
  }

  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(
      normalizeSettings({
        accessiblePaths: envPaths,
        updatedAt: new Date().toISOString(),
      }),
      null,
      2,
    ),
  );
}

function defaultSettings() {
  return {
    accessiblePaths: [],
    scanOptions: {
      scanMode: 'disk-usage',
      ignoreHidden: true,
      followSymlinks: false,
      noCross: true,
      sequential: false,
      topLimit: 30,
    },
    updatedAt: null,
  };
}

function normalizeSettings(settings) {
  const defaults = defaultSettings();
  const scanOptions = settings && typeof settings.scanOptions === 'object' ? settings.scanOptions : {};
  return {
    accessiblePaths: Array.isArray(settings?.accessiblePaths)
      ? settings.accessiblePaths.filter((item) => typeof item === 'string' && item.trim())
      : defaults.accessiblePaths,
    scanOptions: {
      scanMode: scanOptions.scanMode === 'apparent-size' ? 'apparent-size' : 'disk-usage',
      ignoreHidden: toBoolean(scanOptions.ignoreHidden, defaults.scanOptions.ignoreHidden),
      followSymlinks: toBoolean(scanOptions.followSymlinks, defaults.scanOptions.followSymlinks),
      noCross: toBoolean(scanOptions.noCross, defaults.scanOptions.noCross),
      sequential: toBoolean(scanOptions.sequential, defaults.scanOptions.sequential),
      topLimit: normalizePositiveInteger(scanOptions.topLimit, defaults.scanOptions.topLimit),
    },
    updatedAt: settings?.updatedAt || defaults.updatedAt,
  };
}

function toBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return fallback;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function splitPaths(value) {
  return value
    .split(':')
    .map((item) => item.trim())
    .filter(Boolean);
}

function purgeExpiredTasks() {
  const now = Date.now();
  let changed = false;

  for (const [id, task] of tasks.entries()) {
    if (!task.finishedAt) {
      continue;
    }

    if (now - Date.parse(task.finishedAt) > TASK_RETENTION_MS) {
      tasks.delete(id);
      changed = true;
    }
  }

  if (changed) {
    persistTasks();
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    writeJson(res, 200, {
      ok: true,
      port: PORT,
      gduAvailable: fs.existsSync(GDU_BINARY),
      mockMode: Boolean(GDU_MOCK_FILE),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/settings') {
    const settings = readSettings();
    writeJson(res, 200, {
      ...settings,
      gduBinary: GDU_BINARY,
      gduAvailable: fs.existsSync(GDU_BINARY),
      mockMode: Boolean(GDU_MOCK_FILE),
    });
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/settings') {
    const body = await readBody(req);
    const payload = parseJson(body);
    const current = readSettings();
    const incomingScanOptions =
      payload && typeof payload.scanOptions === 'object' ? payload.scanOptions : {};

    const saved = writeSettings({
      accessiblePaths: current.accessiblePaths,
      scanOptions: {
        ...current.scanOptions,
        ...incomingScanOptions,
      },
      updatedAt: new Date().toISOString(),
    });

    writeJson(res, 200, {
      ...saved,
      gduBinary: GDU_BINARY,
      gduAvailable: fs.existsSync(GDU_BINARY),
      mockMode: Boolean(GDU_MOCK_FILE),
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    const recentTasks = Array.from(tasks.values())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 20)
      .map((task) => taskResponse(task));
    writeJson(res, 200, {
      items: recentTasks,
    });
    return;
  }

  if (req.method === 'DELETE' && url.pathname === '/api/tasks') {
    let changed = false;

    for (const task of tasks.values()) {
      if (task.process && task.status === 'running') {
        task.process.kill('SIGTERM');
      }
      changed = true;
    }

    tasks.clear();
    if (changed) {
      persistTasks();
    }

    writeJson(res, 200, {
      ok: true,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    const body = await readBody(req);
    const payload = parseJson(body);
    const targetPath = typeof payload.path === 'string' ? payload.path.trim() : '';

    if (!targetPath) {
      writeJson(res, 400, {
        error: 'invalid_path',
        message: 'A target path is required.',
      });
      return;
    }

    const settings = readSettings();
    const access = validatePathAccess(targetPath, settings.accessiblePaths);

    if (!access.ok) {
      writeJson(res, 403, {
        error: 'path_not_authorized',
        message: access.message,
        accessiblePaths: settings.accessiblePaths,
      });
      return;
    }

    if (!GDU_MOCK_FILE && !fs.existsSync(GDU_BINARY)) {
      writeJson(res, 503, {
        error: 'gdu_missing',
        message: `gdu binary not found at ${GDU_BINARY}. Place the Linux binary at app/bin/gdu before packaging.`,
      });
      return;
    }

    const task = createTask(targetPath, settings.scanOptions);
    tasks.set(task.id, task);
    persistTasks();
    startTask(task);

    writeJson(res, 202, taskResponse(task));
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/analyze/')) {
    const id = url.pathname.slice('/api/analyze/'.length);
    const task = tasks.get(id);

    if (!task) {
      writeJson(res, 404, {
        error: 'not_found',
        message: 'Task not found.',
      });
      return;
    }

    writeJson(res, 200, taskResponse(task));
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/analyze/')) {
    const id = url.pathname.slice('/api/analyze/'.length);
    const task = tasks.get(id);

    if (!task) {
      writeJson(res, 404, {
        error: 'not_found',
        message: 'Task not found.',
      });
      return;
    }

    if (task.process && task.status === 'running') {
      task.process.kill('SIGTERM');
    }

    tasks.delete(id);
    persistTasks();

    writeJson(res, 200, {
      ok: true,
      id,
    });
    return;
  }

  writeJson(res, 404, {
    error: 'not_found',
    message: 'API endpoint not found.',
  });
}

function validatePathAccess(targetPath, accessiblePaths) {
  if (!path.isAbsolute(targetPath)) {
    return {
      ok: false,
      message: 'Only absolute paths are supported.',
    };
  }

  if (!accessiblePaths.length) {
    return {
      ok: false,
      message: 'No authorized directories are available. Grant access in fnOS app settings first.',
    };
  }

  const normalizedTarget = path.resolve(targetPath);

  for (const allowed of accessiblePaths) {
    const normalizedAllowed = path.resolve(allowed);
    if (
      normalizedTarget === normalizedAllowed ||
      normalizedTarget.startsWith(`${normalizedAllowed}${path.sep}`)
    ) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    message: 'The selected path is outside the directories authorized for this app.',
  };
}

function createTask(targetPath, scanOptions) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    path: targetPath,
    scanOptions,
    status: 'queued',
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    error: null,
    result: null,
    stdoutBytes: 0,
    stderr: '',
  };
}

function startTask(task) {
  if (GDU_MOCK_FILE) {
    runMockTask(task);
    return;
  }

  task.status = 'running';
  task.startedAt = new Date().toISOString();
  const args = buildGduArgs(task.scanOptions, task.path);

  const child = spawn(GDU_BINARY, args, {
    cwd: TEMP_ROOT,
    env: process.env,
  });

  task.process = child;
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    task.stdoutBytes += chunk.length;
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    task.stderr += chunk.toString();
  });

  child.on('error', (error) => {
    task.status = 'failed';
    task.error = error.message;
    task.finishedAt = new Date().toISOString();
    persistTasks();
  });

  child.on('close', (code) => {
    task.process = null;
    task.finishedAt = new Date().toISOString();

    if (task.status === 'canceled') {
      persistTasks();
      return;
    }

    if (code !== 0) {
      task.status = 'failed';
      task.error = stderr.trim() || `gdu exited with code ${code}`;
      persistTasks();
      return;
    }

    try {
      const parsed = JSON.parse(stdout);
      task.status = 'completed';
      task.result = summarizeResult(parsed, task.path, task.scanOptions.topLimit);
      persistTasks();
    } catch (error) {
      task.status = 'failed';
      task.error = `Failed to parse gdu JSON: ${error.message}`;
      persistTasks();
    }
  });

  persistTasks();
}

function runMockTask(task) {
  task.status = 'running';
  task.startedAt = new Date().toISOString();
  persistTasks();

  setTimeout(() => {
    try {
      const parsed = JSON.parse(fs.readFileSync(GDU_MOCK_FILE, 'utf8'));
      task.status = 'completed';
      task.finishedAt = new Date().toISOString();
      task.result = summarizeResult(parsed, task.path, task.scanOptions.topLimit);
      persistTasks();
    } catch (error) {
      task.status = 'failed';
      task.error = `Failed to parse mock gdu JSON: ${error.message}`;
      task.finishedAt = new Date().toISOString();
      persistTasks();
    }
  }, 300);
}

function buildGduArgs(scanOptions, targetPath) {
  const args = ['-o-', '--no-progress', '--show-item-count'];

  if (scanOptions.scanMode === 'apparent-size') {
    args.push('--show-apparent-size');
  }

  if (scanOptions.ignoreHidden) {
    args.push('--no-hidden');
  }

  if (scanOptions.followSymlinks) {
    args.push('-L');
  }

  if (scanOptions.noCross) {
    args.push('-x');
  }

  if (scanOptions.sequential) {
    args.push('--sequential');
  }

  args.push(targetPath);
  return args;
}

function summarizeResult(gduTree, rootPath, topLimit) {
  const root = normalizeNode(resolveExportRoot(gduTree), rootPath, true);
  const largest = [];

  walkTree(root, (node) => {
    largest.push({
      path: node.path,
      size: node.size,
      items: node.items,
      type: node.type,
    });
  });

  largest.sort((a, b) => b.size - a.size);

  return {
    root,
    largest: largest.slice(0, topLimit),
  };
}

function resolveExportRoot(payload) {
  if (Array.isArray(payload)) {
    if (payload.length >= 4 && Array.isArray(payload[3])) {
      return payload[3];
    }

    return payload[0] || {};
  }

  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const rootCandidate = getObjectValue(payload, ['root', 'Root', 'data', 'Data', 'tree', 'Tree']);
  if (rootCandidate) {
    return rootCandidate;
  }

  return payload;
}

function normalizeNode(node, fallbackPath, isRoot = false) {
  if (Array.isArray(node)) {
    return normalizeArrayNode(node, fallbackPath, isRoot);
  }

  const safeNode = node && typeof node === 'object' ? node : {};
  const name =
    getStringValue(safeNode, ['name', 'Name', 'filename', 'Filename']) ||
    path.basename(fallbackPath) ||
    fallbackPath;
  const nodePath =
    getStringValue(safeNode, ['path', 'Path', 'fullPath', 'FullPath']) || fallbackPath;
  const childNodes = collectChildNodes(safeNode);
  const hasExplicitDirectoryShape =
    hasAnyKey(safeNode, ['children', 'Children', 'entries', 'Entries', 'dirs', 'Dirs']) ||
    hasAnyKey(safeNode, ['items', 'Items', 'itemCount', 'ItemCount', 'dirCount', 'DirCount']);
  const type = detectNodeType(safeNode, childNodes, isRoot || hasExplicitDirectoryShape);
  const children = childNodes.map((child, index) =>
    normalizeNode(child, buildChildPath(nodePath, child, index), false),
  );
  const explicitSize = getNumberValue(safeNode, [
    'dsize',
    'Dsize',
    'asize',
    'Asize',
    'size',
    'Size',
    'totalSize',
    'TotalSize',
    'apparentSize',
    'ApparentSize',
    'diskUsage',
    'DiskUsage',
  ]);
  const derivedSize =
    explicitSize !== null
      ? explicitSize
      : children.reduce((sum, child) => sum + child.size, 0);
  const explicitItems = getNumberValue(safeNode, [
    'items',
    'Items',
    'itemCount',
    'ItemCount',
    'count',
    'Count',
    'numItems',
    'NumItems',
  ]);

  const items =
    explicitItems !== null
      ? explicitItems
      : type === 'directory'
        ? children.length
        : 1;

  return {
    name,
    path: nodePath,
    type,
    size: Number.isFinite(derivedSize) ? derivedSize : 0,
    items: Number.isFinite(items) ? items : 0,
    children,
  };
}

function normalizeArrayNode(node, fallbackPath, isRoot = false) {
  const header = node[0] && typeof node[0] === 'object' && !Array.isArray(node[0]) ? node[0] : {};
  const entries = node.slice(1);
  const nodePath =
    getStringValue(header, ['path', 'Path', 'fullPath', 'FullPath']) || fallbackPath;
  const name =
    getStringValue(header, ['name', 'Name', 'filename', 'Filename']) ||
    path.basename(nodePath) ||
    nodePath;
  const children = entries.map((child, index) =>
    normalizeNode(child, buildChildPath(nodePath, child, index), false),
  );
  const explicitSize = getNumberValue(header, [
    'dsize',
    'Dsize',
    'size',
    'Size',
    'asize',
    'Asize',
  ]);
  const size =
    explicitSize !== null ? explicitSize : children.reduce((sum, child) => sum + child.size, 0);

  return {
    name,
    path: nodePath,
    type: 'directory',
    size: Number.isFinite(size) ? size : 0,
    items: children.length,
    children,
  };
}

function walkTree(node, visit) {
  visit(node);
  for (const child of node.children) {
    walkTree(child, visit);
  }
}

function taskResponse(task) {
  return {
    id: task.id,
    path: task.path,
    status: task.status,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    error: task.error,
    scanOptions: task.scanOptions,
    result: task.result,
    stdoutBytes: task.stdoutBytes,
    stderr: task.stderr,
  };
}

function collectChildNodes(node) {
  const buckets = [
    getArrayValue(node, ['children', 'Children']),
    getArrayValue(node, ['entries', 'Entries']),
    getArrayValue(node, ['dirs', 'Dirs']),
    getArrayValue(node, ['files', 'Files']),
    getArrayValue(node, ['nodes', 'Nodes']),
  ].filter(Boolean);

  return buckets.flat();
}

function buildChildPath(parentPath, child, index) {
  if (Array.isArray(child)) {
    const header = child[0] && typeof child[0] === 'object' && !Array.isArray(child[0]) ? child[0] : {};
    const childPath = getStringValue(header, ['path', 'Path', 'fullPath', 'FullPath']);
    if (childPath) {
      return childPath;
    }

    const childName =
      getStringValue(header, ['name', 'Name', 'filename', 'Filename']) || `item-${index + 1}`;
    return path.join(parentPath, childName);
  }

  const childPath = getStringValue(child, ['path', 'Path', 'fullPath', 'FullPath']);
  if (childPath) {
    return childPath;
  }

  const childName =
    getStringValue(child, ['name', 'Name', 'filename', 'Filename']) || `item-${index + 1}`;
  return path.join(parentPath, childName);
}

function detectNodeType(node, children, directoryFallback) {
  const explicitType = getStringValue(node, ['type', 'Type', 'kind', 'Kind']);
  if (explicitType) {
    const normalized = explicitType.toLowerCase();
    if (normalized.includes('dir')) {
      return 'directory';
    }
    if (normalized.includes('file')) {
      return 'file';
    }
  }

  const boolDir = getBooleanValue(node, ['isDir', 'IsDir', 'dir', 'Dir', 'directory', 'Directory']);
  if (boolDir !== null) {
    return boolDir ? 'directory' : 'file';
  }

  if (children.length) {
    return 'directory';
  }

  return directoryFallback ? 'directory' : 'file';
}

function getObjectValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function getArrayValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function getStringValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return '';
}

function getNumberValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getBooleanValue(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  }

  return null;
}

function hasAnyKey(source, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large.'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function serveStatic(res, requestPath) {
  const target = requestPath === '/' ? '/index.html' : requestPath;
  const resolved = path.resolve(UI_ROOT, `.${target}`);

  if (!resolved.startsWith(path.resolve(UI_ROOT))) {
    writeJson(res, 403, { error: 'forbidden' });
    return;
  }

  fs.readFile(resolved, (error, content) => {
    if (error) {
      if (requestPath !== '/' && requestPath !== '/index.html') {
        writeJson(res, 404, { error: 'not_found' });
        return;
      }

      fs.readFile(path.join(UI_ROOT, 'index.html'), (fallbackError, fallbackContent) => {
        if (fallbackError) {
          writeJson(res, 404, { error: 'not_found' });
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallbackContent);
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType(resolved),
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(payload));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}
