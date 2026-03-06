const state = {
  taskId: null,
  pollTimer: null,
  accessiblePaths: [],
  rootNode: null,
  zoomPath: [],
  selectedPath: null,
};

const pathInput = document.getElementById('pathInput');
const analyzeButton = document.getElementById('analyzeButton');
const accessiblePathSelect = document.getElementById('accessiblePathSelect');
const accessiblePathsEmpty = document.getElementById('accessiblePathsEmpty');
const accessiblePathsList = document.getElementById('accessiblePathsList');
const taskStatus = document.getElementById('taskStatus');
const scanOptionsSummary = document.getElementById('scanOptionsSummary');
const treemapView = document.getElementById('treemapView');
const breadcrumbBar = document.getElementById('breadcrumbBar');
const selectionDetails = document.getElementById('selectionDetails');
const childrenList = document.getElementById('childrenList');
const recentTasks = document.getElementById('recentTasks');
const healthLabel = document.getElementById('healthLabel');
const gduLabel = document.getElementById('gduLabel');
const zoomOutButton = document.getElementById('zoomOutButton');
const resetZoomButton = document.getElementById('resetZoomButton');
const copyPathButton = document.getElementById('copyPathButton');
const openInFilesButton = document.getElementById('openInFilesButton');
const clearTasksButton = document.getElementById('clearTasksButton');

bootstrap().catch((error) => {
  showError(error.message || '初始化失败');
});

analyzeButton.addEventListener('click', () => {
  startAnalyze().catch((error) => {
    showError(error.message || '分析启动失败');
  });
});

accessiblePathSelect.addEventListener('change', () => {
  if (accessiblePathSelect.value) {
    pathInput.value = accessiblePathSelect.value;
  }
});

zoomOutButton.addEventListener('click', () => {
  if (!state.zoomPath.length) {
    return;
  }
  state.zoomPath = state.zoomPath.slice(0, -1);
  state.selectedPath = getCurrentNode()?.path || state.selectedPath;
  renderWorkspace();
});

resetZoomButton.addEventListener('click', () => {
  state.zoomPath = [];
  state.selectedPath = state.rootNode?.path || null;
  renderWorkspace();
});

copyPathButton.addEventListener('click', async () => {
  const node = getSelectedNode();
  if (!node?.path) {
    showError('当前没有可复制的路径');
    return;
  }

  try {
    await copyText(node.path);
    showMessage('路径已复制');
  } catch {
    showError('复制失败，请手动复制路径');
  }
});

openInFilesButton.addEventListener('click', () => {
  const node = getSelectedNode();
  if (!node?.path) {
    showError('当前没有可打开的路径');
    return;
  }

  showError('暂未接入 FNOS 文件管理器打开接口。当前先保留路径复制能力。');
});

clearTasksButton.addEventListener('click', () => {
  clearTasks().catch((error) => {
    showError(error.message || '清空记录失败');
  });
});

window.addEventListener('resize', throttle(renderTreemapOnly, 120));

async function bootstrap() {
  const [health, settings, tasks] = await Promise.all([
    fetchJson('/api/health'),
    fetchJson('/api/settings'),
    fetchJson('/api/tasks'),
  ]);

  healthLabel.textContent = health.ok ? '服务正常' : '服务异常';
  gduLabel.textContent = health.gduAvailable
    ? `gdu 已就绪: ${settings.gduBinary}`
    : `缺少 gdu: ${settings.gduBinary}`;

  state.accessiblePaths = settings.accessiblePaths || [];
  renderAccessiblePaths();
  renderScanOptions(settings.scanOptions || {});
  renderRecentTasks(tasks.items || []);
}

function renderAccessiblePaths() {
  accessiblePathsList.innerHTML = '';
  accessiblePathSelect.innerHTML = '<option value="">请选择已授权目录</option>';

  if (!state.accessiblePaths.length) {
    accessiblePathsEmpty.textContent = '当前没有授权目录，请先在 FNOS 应用设置里授权。';
    pathInput.value = '';
    return;
  }

  accessiblePathsEmpty.textContent = '';

  state.accessiblePaths.forEach((item, index) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item;
    accessiblePathsList.append(chip);

    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    accessiblePathSelect.append(option);

    if (index === 0) {
      accessiblePathSelect.value = item;
      pathInput.value = item;
    }
  });
}

async function startAnalyze() {
  const targetPath = (pathInput.value || '').trim();
  if (!targetPath) {
    throw new Error('请先输入目录路径');
  }

  analyzeButton.loading = true;
  taskStatus.textContent = '正在提交任务';

  try {
    const response = await fetchJson('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath }),
    });

    state.taskId = response.id;
    taskStatus.textContent = `任务已创建，正在分析 ${response.path}`;
    clearWorkspace();
    await refreshRecentTasks();
    await pollTask();
  } finally {
    analyzeButton.loading = false;
  }
}

async function pollTask() {
  if (!state.taskId) {
    return;
  }

  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
  }

  const task = await fetchJson(`/api/analyze/${state.taskId}`);
  renderTask(task);

  if (task.status === 'queued' || task.status === 'running') {
    state.pollTimer = setTimeout(() => {
      pollTask().catch((error) => {
        showError(error.message || '轮询失败');
      });
    }, 1200);
    return;
  }

  await refreshRecentTasks();
}

function renderTask(task) {
  if (task.status === 'failed') {
    taskStatus.textContent = `分析失败: ${task.error || '未知错误'}`;
    treemapView.innerHTML = `<div class="treemap-empty">${escapeHtml(task.error || '未知错误')}</div>`;
    selectionDetails.innerHTML = '<div class="selection-empty">没有可展示的结果</div>';
    childrenList.innerHTML = '<div class="list-empty">没有可展示的结果</div>';
    breadcrumbBar.textContent = '没有结果';
    return;
  }

  if (task.status === 'completed') {
    taskStatus.textContent = `分析完成: ${task.path}`;
    state.rootNode = task.result?.root || null;
    state.zoomPath = [];
    state.selectedPath = state.rootNode?.path || null;
    renderWorkspace();
    return;
  }

  taskStatus.textContent = `分析中，已读取 ${formatBytes(task.stdoutBytes || 0)}`;
}

function renderWorkspace() {
  renderTreemapOnly();
  renderSelection();
  renderChildrenList();
  renderBreadcrumb();
}

function renderTreemapOnly() {
  const currentNode = getCurrentNode();
  if (!currentNode) {
    treemapView.innerHTML = '<div class="treemap-empty">等待结果</div>';
    return;
  }

  const entries = (currentNode.children || [])
    .filter((child) => child.size > 0)
    .sort((a, b) => b.size - a.size);

  if (!entries.length) {
    treemapView.innerHTML = '<div class="treemap-empty">当前节点没有可展示的子项</div>';
    return;
  }

  const width = treemapView.clientWidth || 860;
  const height = treemapView.clientHeight || 660;
  const layout = computeSquarifiedTreemap(entries, { x: 0, y: 0, width, height });
  const currentTotal = Math.max(currentNode.size || sumNodeSize(entries), 1);

  treemapView.innerHTML = layout
    .map((item) => {
      const node = item.node;
      const tiny = item.width < 96 || item.height < 62 ? ' tiny' : '';
      const micro = item.width < 46 || item.height < 30 ? ' micro' : '';
      const selected = node.path === state.selectedPath ? ' selected' : '';
      return `
        <button
          class="treemap-node${tiny}${micro}${selected}"
          type="button"
          data-path="${escapeAttribute(node.path)}"
          title="${escapeAttribute(`${node.path}\n${formatBytes(node.size)}`)}"
          style="left:${item.x}px;top:${item.y}px;width:${item.width}px;height:${item.height}px;background:${nodeFill(node, currentTotal)};"
        >
          <div class="treemap-node-name">${escapeHtml(node.name)}</div>
          <div class="treemap-node-meta">${formatBytes(node.size)} / ${typeText(node.type)}</div>
        </button>
      `;
    })
    .join('');

  treemapView.querySelectorAll('.treemap-node').forEach((element) => {
    element.addEventListener('click', () => {
      focusNode(element.dataset.path);
    });
  });
}

function renderSelection() {
  const node = getSelectedNode() || getCurrentNode();
  if (!node) {
    selectionDetails.innerHTML = '<div class="selection-empty">点击任意块查看详情</div>';
    return;
  }

  selectionDetails.innerHTML = `
    <div class="selection-meta">${escapeHtml(node.path)}</div>
    <div class="detail-grid">
      <div class="detail-row"><span>类型</span><span>${typeText(node.type)}</span></div>
      <div class="detail-row"><span>占用</span><span>${formatBytes(node.size)}</span></div>
      <div class="detail-row"><span>当前层级子项数</span><span>${formatCount(node)}</span></div>
      <div class="detail-row"><span>占根目录比例</span><span>${formatPercent(node.size, state.rootNode?.size || 0)}</span></div>
    </div>
  `;
}

function renderChildrenList() {
  const node = getCurrentNode();
  if (!node) {
    childrenList.innerHTML = '<div class="list-empty">等待结果</div>';
    return;
  }

  const items = (node.children || []).slice().sort((a, b) => b.size - a.size);
  if (!items.length) {
    childrenList.innerHTML = '<div class="list-empty">当前层级没有子项</div>';
    return;
  }

  childrenList.innerHTML = items
    .map(
      (item) => `
        <button class="list-row interactive-row" type="button" data-path="${escapeAttribute(item.path)}">
          <div class="list-main">
            <div class="list-path">${escapeHtml(item.name)}</div>
            <div class="list-size">${formatBytes(item.size)}</div>
          </div>
          <div class="list-meta">${typeText(item.type)} / ${formatCount(item)}</div>
        </button>
      `,
    )
    .join('');

  childrenList.querySelectorAll('[data-path]').forEach((button) => {
    button.addEventListener('click', () => {
      focusNode(button.dataset.path);
    });
  });
}

function renderBreadcrumb() {
  const node = getCurrentNode();
  if (!node) {
    breadcrumbBar.textContent = '等待结果';
    return;
  }

  const crumbs = [state.rootNode, ...state.zoomPath].filter(Boolean);
  breadcrumbBar.innerHTML = crumbs
    .map(
      (item) => `
        <button class="breadcrumb-link" type="button" data-path="${escapeAttribute(item.path)}">
          ${escapeHtml(item.name)}
        </button>
      `,
    )
    .join('<span class="breadcrumb-sep">/</span>');

  breadcrumbBar.querySelectorAll('[data-path]').forEach((button) => {
    button.addEventListener('click', () => {
      focusNode(button.dataset.path, false);
    });
  });
}

function clearWorkspace() {
  state.rootNode = null;
  state.zoomPath = [];
  state.selectedPath = null;
  treemapView.innerHTML = '<div class="treemap-empty">等待结果</div>';
  selectionDetails.innerHTML = '<div class="selection-empty">点击任意块查看详情</div>';
  childrenList.innerHTML = '<div class="list-empty">等待结果</div>';
  breadcrumbBar.textContent = '等待结果';
}

function focusNode(targetPath, zoomDirectories = true) {
  const node = findNodeByPath(state.rootNode, targetPath);
  if (!node) {
    return;
  }

  state.selectedPath = node.path;
  if (zoomDirectories && node.type === 'directory' && node.children?.length) {
    state.zoomPath = buildPathToNode(state.rootNode, node.path) || state.zoomPath;
  }
  renderWorkspace();
}

function renderScanOptions(scanOptions) {
  const labels = [];
  labels.push(scanOptions.scanMode === 'apparent-size' ? '表观大小' : '磁盘占用');
  labels.push(scanOptions.ignoreHidden ? '忽略隐藏目录' : '包含隐藏目录');
  labels.push(scanOptions.noCross ? '不跨文件系统' : '允许跨文件系统');
  labels.push(scanOptions.followSymlinks ? '跟随符号链接' : '不跟随符号链接');
  labels.push(scanOptions.sequential ? '顺序扫描' : '并发扫描');
  labels.push(`前 ${scanOptions.topLimit || 30} 项`);
  scanOptionsSummary.textContent = labels.join(' / ');
}

async function clearTasks() {
  await fetchJson('/api/tasks', { method: 'DELETE' });
  await refreshRecentTasks();
  showMessage('任务记录已清空');
}

async function refreshRecentTasks() {
  const tasks = await fetchJson('/api/tasks');
  renderRecentTasks(tasks.items || []);
}

function renderRecentTasks(items) {
  if (!items.length) {
    recentTasks.innerHTML = '<div class="recent-empty">还没有分析记录</div>';
    return;
  }

  recentTasks.innerHTML = items
    .map(
      (item) => `
        <div class="recent-row">
          <div class="recent-main">
            <div class="recent-path">${escapeHtml(item.path)}</div>
            <div class="status-badge">${statusText(item.status)}</div>
          </div>
          <div class="recent-meta">
            ${escapeHtml(formatDate(item.createdAt))}
            ${item.error ? ` / ${escapeHtml(item.error)}` : ''}
          </div>
          <div class="recent-actions">
            <button class="action-link" type="button" data-path="${escapeAttribute(item.path)}">重新分析</button>
            <button class="action-link" type="button" data-task-id="${escapeAttribute(item.id)}">查看结果</button>
            <button class="action-link action-link-danger" type="button" data-delete-id="${escapeAttribute(item.id)}">删除记录</button>
          </div>
        </div>
      `,
    )
    .join('');

  recentTasks.querySelectorAll('[data-path]').forEach((button) => {
    button.addEventListener('click', () => {
      pathInput.value = button.dataset.path || '';
      startAnalyze().catch((error) => {
        showError(error.message || '分析启动失败');
      });
    });
  });

  recentTasks.querySelectorAll('[data-task-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const task = await fetchJson(`/api/analyze/${button.dataset.taskId}`);
        state.taskId = task.id;
        renderTask(task);
      } catch (error) {
        showError(error.message || '读取任务失败');
      }
    });
  });

  recentTasks.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await fetchJson(`/api/analyze/${button.dataset.deleteId}`, { method: 'DELETE' });
        if (state.taskId === button.dataset.deleteId) {
          clearWorkspace();
          state.taskId = null;
        }
        await refreshRecentTasks();
        showMessage('任务记录已删除');
      } catch (error) {
        showError(error.message || '删除记录失败');
      }
    });
  });
}

function getCurrentNode() {
  if (!state.rootNode) {
    return null;
  }
  if (!state.zoomPath.length) {
    return state.rootNode;
  }
  return state.zoomPath[state.zoomPath.length - 1];
}

function getSelectedNode() {
  if (!state.rootNode || !state.selectedPath) {
    return getCurrentNode();
  }
  return findNodeByPath(state.rootNode, state.selectedPath) || getCurrentNode();
}

function findNodeByPath(node, targetPath) {
  if (!node || !targetPath) {
    return null;
  }
  if (node.path === targetPath) {
    return node;
  }
  for (const child of node.children || []) {
    const found = findNodeByPath(child, targetPath);
    if (found) {
      return found;
    }
  }
  return null;
}

function buildPathToNode(root, targetPath, trail = []) {
  if (!root) {
    return null;
  }
  if (root.path === targetPath) {
    return trail;
  }
  for (const child of root.children || []) {
    const nextTrail = child.type === 'directory' ? [...trail, child] : trail;
    const found = buildPathToNode(child, targetPath, nextTrail);
    if (found) {
      return found;
    }
  }
  return null;
}

function computeSquarifiedTreemap(nodes, rect) {
  const cleanNodes = nodes
    .filter((node) => node.size > 0)
    .sort((a, b) => b.size - a.size);

  if (!cleanNodes.length || rect.width <= 1 || rect.height <= 1) {
    return [];
  }

  const weights = rebalanceDisplayWeights(cleanNodes);
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  const areaScale = (rect.width * rect.height) / Math.max(totalWeight, 1);
  const items = weights.map((item) => ({
    node: item.node,
    area: Math.max(item.weight * areaScale, 1),
  }));

  return squarify(items, [], shortestSide(rect), rect, []);
}

function rebalanceDisplayWeights(nodes) {
  if (!nodes.length) {
    return [];
  }

  const total = sumNodeSize(nodes);
  const capRatio = 0.5;
  const raw = nodes.map((node) => ({
    node,
    ratio: node.size / Math.max(total, 1),
  }));

  const capped = raw.map((item) => ({
    node: item.node,
    ratio: Math.min(item.ratio, capRatio),
  }));

  const used = capped.reduce((sum, item) => sum + item.ratio, 0);
  const overflow = Math.max(1 - used, 0);
  const uncappedPool = raw
    .filter((item) => item.ratio < capRatio)
    .reduce((sum, item) => sum + item.ratio, 0);

  return capped.map((item) => {
    const original = raw.find((rawItem) => rawItem.node === item.node);
    if (!original) {
      return { node: item.node, weight: item.ratio };
    }
    if (original.ratio >= capRatio || uncappedPool <= 0) {
      return { node: item.node, weight: item.ratio };
    }
    return {
      node: item.node,
      weight: item.ratio + (original.ratio / uncappedPool) * overflow,
    };
  });
}

function squarify(items, row, sideLength, rect, output) {
  if (!items.length) {
    if (!row.length) {
      return output;
    }
    const laid = layoutRow(row, rect);
    return output.concat(laid.items);
  }

  const next = items[0];
  const tentative = [...row, next];

  if (!row.length || worstRatio(tentative, sideLength) <= worstRatio(row, sideLength)) {
    return squarify(items.slice(1), tentative, sideLength, rect, output);
  }

  const laid = layoutRow(row, rect);
  return squarify(items, [], shortestSide(laid.remainingRect), laid.remainingRect, output.concat(laid.items));
}

function layoutRow(row, rect) {
  const rowArea = row.reduce((sum, item) => sum + item.area, 0);
  const horizontal = rect.width >= rect.height;
  const items = [];

  if (horizontal) {
    const rowHeight = rowArea / rect.width;
    let offsetX = rect.x;
    row.forEach((item, index) => {
      const itemWidth = index === row.length - 1 ? rect.x + rect.width - offsetX : item.area / rowHeight;
      items.push({
        node: item.node,
        x: Math.round(offsetX),
        y: Math.round(rect.y),
        width: Math.max(Math.round(itemWidth), 1),
        height: Math.max(Math.round(rowHeight), 1),
      });
      offsetX += itemWidth;
    });

    return {
      items,
      remainingRect: {
        x: rect.x,
        y: rect.y + rowHeight,
        width: rect.width,
        height: Math.max(rect.height - rowHeight, 0),
      },
    };
  }

  const rowWidth = rowArea / rect.height;
  let offsetY = rect.y;
  row.forEach((item, index) => {
    const itemHeight = index === row.length - 1 ? rect.y + rect.height - offsetY : item.area / rowWidth;
    items.push({
      node: item.node,
      x: Math.round(rect.x),
      y: Math.round(offsetY),
      width: Math.max(Math.round(rowWidth), 1),
      height: Math.max(Math.round(itemHeight), 1),
    });
    offsetY += itemHeight;
  });

  return {
    items,
    remainingRect: {
      x: rect.x + rowWidth,
      y: rect.y,
      width: Math.max(rect.width - rowWidth, 0),
      height: rect.height,
    },
  };
}

function worstRatio(row, sideLength) {
  if (!row.length || !sideLength) {
    return Number.POSITIVE_INFINITY;
  }
  const areas = row.map((item) => item.area);
  const total = areas.reduce((sum, area) => sum + area, 0);
  const minArea = Math.min(...areas);
  const maxArea = Math.max(...areas);
  const sideSquared = sideLength * sideLength;
  return Math.max((sideSquared * maxArea) / (total * total), (total * total) / (sideSquared * minArea));
}

function shortestSide(rect) {
  return Math.max(Math.min(rect.width, rect.height), 1);
}

function sumNodeSize(nodes) {
  return nodes.reduce((sum, node) => sum + Math.max(node.size || 0, 1), 0);
}

function nodeFill(node, total) {
  const ratio = Math.max(Math.min(node.size / Math.max(total, 1), 1), 0);
  const boosted = Math.pow(ratio, 0.38);

  if (node.type === 'directory') {
    const hue = 38 - boosted * 14;
    const sat = 68 + boosted * 10;
    const lightA = 84 - boosted * 24;
    const lightB = 58 - boosted * 24;
    return `linear-gradient(145deg, hsl(${hue} ${sat}% ${lightA}%), hsl(${hue - 8} ${sat + 8}% ${lightB}%))`;
  }

  const hue = 198 + boosted * 24;
  const sat = 55 + boosted * 18;
  const lightA = 82 - boosted * 24;
  const lightB = 52 - boosted * 24;
  return `linear-gradient(145deg, hsl(${hue} ${sat}% ${lightA}%), hsl(${hue - 14} ${sat + 6}% ${lightB}%))`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `请求失败: ${response.status}`);
  }
  return data;
}

function formatBytes(value) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Number(value || 0);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatPercent(value, total) {
  if (!total) {
    return '0%';
  }
  return `${((value / total) * 100).toFixed(1)}%`;
}

function typeText(type) {
  return type === 'directory' ? '目录' : '文件';
}

function formatCount(node) {
  if (node.type === 'file') {
    return '1 项';
  }
  return `${Number(node.items || 0)} 项`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function statusText(status) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'running':
      return '分析中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'canceled':
      return '已取消';
    default:
      return status;
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function throttle(fn, wait) {
  let timeoutId = null;
  return () => {
    if (timeoutId) {
      return;
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn();
    }, wait);
  };
}

function showMessage(message) {
  if (window.mdui?.snackbar) {
    mdui.snackbar({ message });
    return;
  }
  window.alert(message);
}

function showError(message) {
  showMessage(message);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('copy_failed');
  }
}
