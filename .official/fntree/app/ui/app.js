const state = {
  taskId: null,
  pollTimer: null,
  accessiblePaths: [],
  rootNode: null,
  zoomPath: [],
  selectedPath: null,
  detailLevel: 0,
  menuOpen: false,
  historyOpen: false,
  layoutCache: new Map(),
};

const pathInput = document.getElementById('pathInput');
const analyzeButton = document.getElementById('analyzeButton');
const accessiblePathTrigger = document.getElementById('accessiblePathTrigger');
const accessiblePathMenu = document.getElementById('accessiblePathMenu');
const accessiblePathsEmpty = document.getElementById('accessiblePathsEmpty');
const accessiblePathsList = document.getElementById('accessiblePathsList');
const taskStatus = document.getElementById('taskStatus');
const scanOptionsSummary = document.getElementById('scanOptionsSummary');
const treemapView = document.getElementById('treemapView');
const breadcrumbBar = document.getElementById('breadcrumbBar');
const selectionDetails = document.getElementById('selectionDetails');
const childrenList = document.getElementById('childrenList');
const recentTasks = document.getElementById('recentTasks');
const historyToggleButton = document.getElementById('historyToggleButton');
const historyCloseButton = document.getElementById('historyCloseButton');
const historyDrawer = document.getElementById('historyDrawer');
const historyBackdrop = document.getElementById('historyBackdrop');
const healthLabel = document.getElementById('healthLabel');
const gduLabel = document.getElementById('gduLabel');
const detailLevelLabel = document.getElementById('detailLevelLabel');
const zoomOutButton = document.getElementById('zoomOutButton');
const resetZoomButton = document.getElementById('resetZoomButton');
const copyPathButton = document.getElementById('copyPathButton');
const openInFilesButton = document.getElementById('openInFilesButton');
const clearTasksButton = document.getElementById('clearTasksButton');
const TREEMAP_MAX_VISIBLE = 24;
let treemapTooltip = null;

bootstrap().catch((error) => {
  showError(error.message || '初始化失败');
});

analyzeButton.addEventListener('click', () => {
  startAnalyze().catch((error) => {
    showError(error.message || '分析启动失败');
  });
});

accessiblePathTrigger.addEventListener('click', () => {
  if (!state.accessiblePaths.length) {
    return;
  }
  setPathMenuOpen(!state.menuOpen);
});

document.addEventListener('click', (event) => {
  if (!state.menuOpen) {
    return;
  }
  const target = event.target;
  if (
    target instanceof Node &&
    !accessiblePathTrigger.contains(target) &&
    !accessiblePathMenu.contains(target)
  ) {
    setPathMenuOpen(false);
  }
});

zoomOutButton.addEventListener('click', () => {
  if (!state.zoomPath.length) {
    return;
  }
  state.zoomPath = state.zoomPath.slice(0, -1);
  state.selectedPath = getCurrentNode()?.path || state.selectedPath;
  state.detailLevel = 0;
  renderWorkspace();
});

resetZoomButton.addEventListener('click', () => {
  state.zoomPath = [];
  state.selectedPath = state.rootNode?.path || null;
  state.detailLevel = 0;
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

historyToggleButton?.addEventListener('click', () => {
  setHistoryOpen(true);
});

historyCloseButton?.addEventListener('click', () => {
  setHistoryOpen(false);
});

historyBackdrop?.addEventListener('click', () => {
  setHistoryOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.historyOpen) {
    setHistoryOpen(false);
  }
});

window.addEventListener('resize', throttle(renderTreemapOnly, 120));
treemapView.addEventListener(
  'wheel',
  (event) => {
    const children = getCurrentNode()?.children?.filter((child) => child.size > 0) || [];
    if (children.length <= 1) {
      return;
    }

    event.preventDefault();
    const maxLevel = Math.max(children.length - getVisibleTreemapCount(children.length), 0);
    const nextLevel = Math.max(
      0,
      Math.min(maxLevel, state.detailLevel + (event.deltaY > 0 ? 1 : -1)),
    );

    if (nextLevel === state.detailLevel) {
      return;
    }

    state.detailLevel = nextLevel;
    renderTreemapOnly();
  },
  { passive: false },
);

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
  clearWorkspace();
}

function renderAccessiblePaths() {
  accessiblePathsList.innerHTML = '';
  accessiblePathMenu.innerHTML = '';

  if (!state.accessiblePaths.length) {
    accessiblePathsEmpty.textContent = '当前没有授权目录，请先在 FNOS 应用设置里授权。';
    accessiblePathTrigger.textContent = '请选择已授权目录';
    pathInput.value = '';
    return;
  }

  accessiblePathsEmpty.textContent = '';

  state.accessiblePaths.forEach((item, index) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item;
    accessiblePathsList.append(chip);

    const option = document.createElement('button');
    option.className = 'path-picker-option';
    option.type = 'button';
    option.textContent = item;
    option.dataset.path = item;
    option.addEventListener('click', () => {
      pathInput.value = item;
      accessiblePathTrigger.textContent = item;
      setPathMenuOpen(false);
    });
    accessiblePathMenu.append(option);

    if (index === 0) {
      accessiblePathTrigger.textContent = item;
      pathInput.value = item;
    }
  });
}

function setPathMenuOpen(open) {
  state.menuOpen = open;
  accessiblePathMenu.hidden = !open;
  accessiblePathTrigger.classList.toggle('is-open', open);
}

function setHistoryOpen(open) {
  state.historyOpen = open;
  historyDrawer?.classList.toggle('is-open', open);
  historyDrawer?.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (historyBackdrop) {
    historyBackdrop.hidden = !open;
    historyBackdrop.classList.toggle('is-open', open);
  }
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
    treemapView.className = 'treemap-empty';
    treemapView.innerHTML = '<div class="treemap-empty">没有可展示的结果</div>';
    selectionDetails.className = 'selection-empty';
    selectionDetails.textContent = '没有可展示的结果';
    childrenList.className = 'list-empty';
    childrenList.innerHTML = '<div class="list-empty">没有可展示的结果</div>';
    breadcrumbBar.textContent = '没有结果';
    detailLevelLabel.textContent = '滚轮细化 0';
    return;
  }

  if (task.status === 'completed') {
    taskStatus.textContent = `分析完成: ${task.path}`;
    state.rootNode = task.result?.root || null;
    state.zoomPath = [];
    state.selectedPath = state.rootNode?.path || null;
    state.detailLevel = 0;
    state.layoutCache = new Map();
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
    treemapView.className = 'treemap-empty';
    treemapView.innerHTML = '<div class="treemap-empty">等待结果</div>';
    detailLevelLabel.textContent = '滚轮细化 0';
    return;
  }

  const entries = (currentNode.children || [])
    .filter((child) => child.size > 0)
    .sort((a, b) => b.size - a.size);

  if (!entries.length) {
    treemapView.className = 'treemap-empty';
    treemapView.innerHTML = '<div class="treemap-empty">当前节点没有可展示的子项</div>';
    detailLevelLabel.textContent = '滚轮细化 0';
    return;
  }

  treemapView.className = '';
  const width = treemapView.clientWidth || 860;
  const height = treemapView.clientHeight || 660;
  const layout = computeSquarifiedTreemap(entries, { x: 0, y: 0, width, height });
  const currentTotal = Math.max(currentNode.size || sumNodeSize(entries), 1);
  detailLevelLabel.textContent = `滚轮细化 ${state.detailLevel}`;
  patchTreemapNodes(layout, currentTotal);
}

function patchTreemapNodes(layout, currentTotal) {
  const nextPaths = new Set(layout.map((item) => item.node.path));
  const existingNodes = new Map(
    Array.from(treemapView.querySelectorAll('.treemap-node')).map((element) => [element.dataset.path, element]),
  );

  layout.forEach((item) => {
    const path = item.node.path;
    let element = existingNodes.get(path);
    const labelMode = getLabelMode(item);
    const selected = path === state.selectedPath ? ' selected' : '';
    const previous = state.layoutCache.get(path);

    if (!element) {
      element = document.createElement('button');
      element.type = 'button';
      element.className = 'treemap-node entering';
      element.dataset.path = path;
      element.style.opacity = '0';
      treemapView.append(element);
      element.addEventListener('click', () => {
        focusNode(path);
      });
      element.addEventListener('mouseenter', handleTreemapTooltipEnter);
      element.addEventListener('mousemove', handleTreemapTooltipMove);
      element.addEventListener('mouseleave', hideTreemapTooltip);
    }

    element.dataset.path = path;
    element.className = `treemap-node ${labelMode}${selected}`.trim();
    element.dataset.tooltip = `${item.node.path}\n${formatBytes(item.node.size)} / ${typeText(item.node.type)}`;
    element.style.background = nodeFill(item.node, currentTotal);
    element.innerHTML = renderNodeBody(item.node, item, currentTotal, labelMode);

    if (previous) {
      element.style.left = `${previous.x}px`;
      element.style.top = `${previous.y}px`;
      element.style.width = `${previous.width}px`;
      element.style.height = `${previous.height}px`;
      element.style.opacity = '1';
      requestAnimationFrame(() => {
        element.style.left = `${item.x}px`;
        element.style.top = `${item.y}px`;
        element.style.width = `${item.width}px`;
        element.style.height = `${item.height}px`;
        element.style.opacity = '1';
      });
    } else {
      element.style.left = `${item.x}px`;
      element.style.top = `${item.y}px`;
      element.style.width = `${item.width}px`;
      element.style.height = `${item.height}px`;
      requestAnimationFrame(() => {
        element.style.opacity = '1';
      });
    }
  });

  existingNodes.forEach((element, path) => {
    if (nextPaths.has(path)) {
      return;
    }
    element.classList.add('leaving');
    element.style.opacity = '0';
    element.style.transform = 'scale(0.92)';
    setTimeout(() => {
      if (element.parentNode === treemapView) {
        treemapView.removeChild(element);
      }
    }, 220);
  });

  state.layoutCache = new Map(layout.map((item) => [item.node.path, item]));
}

function renderNodeBody(node, item, total, labelMode) {
  const percent = formatPercent(node.size, total);
  if (labelMode === 'micro') {
    return '';
  }
  if (labelMode === 'tiny') {
    return `
      <div class="treemap-node-content">
        <div class="treemap-node-name">${escapeHtml(node.name)}</div>
        <div class="treemap-node-meta">${percent}</div>
      </div>
    `;
  }
  if (labelMode === 'compact') {
    return `
      <div class="treemap-node-content">
        <div class="treemap-node-name">${escapeHtml(node.name)}</div>
        <div class="treemap-node-meta">${percent}</div>
      </div>
    `;
  }
  return `
    <div class="treemap-node-content">
      <div class="treemap-node-name">${escapeHtml(node.name)}</div>
      <div class="treemap-node-meta">${percent}</div>
      <div class="treemap-node-submeta">${formatBytes(node.size)} / ${typeText(node.type)}</div>
    </div>
  `;
}

function getLabelMode(item) {
  if (item.width < 34 || item.height < 22) {
    return 'micro';
  }
  if (item.width < 68 || item.height < 34) {
    return 'tiny';
  }
  if (item.width < 104 || item.height < 52) {
    return 'compact';
  }
  return 'full';
}

function renderSelection() {
  const node = getSelectedNode() || getCurrentNode();
  if (!node) {
    selectionDetails.className = 'selection-empty';
    selectionDetails.textContent = '点击任意块查看详情';
    return;
  }

  selectionDetails.className = '';
  selectionDetails.innerHTML = `
    <div class="selection-meta">${escapeHtml(node.path)}</div>
    <div class="detail-grid">
      <div class="detail-row"><span>类型</span><span>${typeText(node.type)}</span></div>
      <div class="detail-row"><span>占用</span><span>${formatBytes(node.size)}</span></div>
      <div class="detail-row"><span>当前层级占比</span><span>${formatPercent(node.size, getLevelReferenceSize(node))}</span></div>
      <div class="detail-row"><span>子项数</span><span>${formatCount(node)}</span></div>
    </div>
  `;
}

function getLevelReferenceSize(node) {
  const currentNode = getCurrentNode();
  if (!node) {
    return 0;
  }
  if (!currentNode) {
    return node.size || 0;
  }
  if (node.path !== currentNode.path) {
    return currentNode.size || 0;
  }
  return findParentNode(state.rootNode, node.path)?.size || currentNode.size || 0;
}

function renderChildrenList() {
  const node = getCurrentNode();
  if (!node) {
    childrenList.className = 'list-empty';
    childrenList.innerHTML = '<div class="list-empty">等待结果</div>';
    return;
  }

  const items = (node.children || []).slice().sort((a, b) => b.size - a.size);
  if (!items.length) {
    childrenList.className = 'list-empty';
    childrenList.innerHTML = '<div class="list-empty">当前层级没有子项</div>';
    return;
  }

  childrenList.className = '';
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
      const targetPath = button.dataset.path;
      const nodeByPath = findNodeByPath(state.rootNode, targetPath);
      if (!nodeByPath) {
        return;
      }
      state.selectedPath = targetPath;
      state.zoomPath = buildPathToNode(state.rootNode, targetPath) || [];
      state.detailLevel = 0;
      state.layoutCache = new Map();
      renderWorkspace();
    });
  });
}

function clearWorkspace() {
  state.rootNode = null;
  state.zoomPath = [];
  state.selectedPath = null;
  state.detailLevel = 0;
  state.layoutCache = new Map();
  treemapView.className = 'treemap-empty';
  treemapView.innerHTML = '<div class="treemap-empty">等待结果</div>';
  selectionDetails.className = 'selection-empty';
  selectionDetails.textContent = '点击任意块查看详情';
  childrenList.className = 'list-empty';
  childrenList.innerHTML = '<div class="list-empty">等待结果</div>';
  breadcrumbBar.textContent = '等待结果';
  detailLevelLabel.textContent = '滚轮细化 0';
}

function focusNode(targetPath) {
  const node = findNodeByPath(state.rootNode, targetPath);
  if (!node) {
    return;
  }

  state.selectedPath = node.path;
  if (node.type === 'directory' && node.children?.length) {
    state.zoomPath = buildPathToNode(state.rootNode, node.path) || state.zoomPath;
    state.detailLevel = 0;
    state.layoutCache = new Map();
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

function findParentNode(node, targetPath, parent = null) {
  if (!node || !targetPath) {
    return null;
  }
  if (node.path === targetPath) {
    return parent;
  }
  for (const child of node.children || []) {
    const found = findParentNode(child, targetPath, node);
    if (found || child.path === targetPath) {
      return found || node;
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

  const hiddenCount = Math.min(state.detailLevel, Math.max(cleanNodes.length - 1, 0));
  const visibleCount = getVisibleTreemapCount(cleanNodes.length);
  const visibleNodes = cleanNodes.slice(hiddenCount, hiddenCount + visibleCount);
  const weights = rebalanceDisplayWeights(visibleNodes);
  const visible = weights.filter((item) => item.weight > 0.0005);
  const totalWeight = visible.reduce((sum, item) => sum + item.weight, 0);
  const items = visible.map((item) => ({
    node: item.node,
    weight: item.weight / Math.max(totalWeight, 1e-9),
  }));

  return layoutTreemapBinary(items, rect);
}

function getVisibleTreemapCount(totalNodes) {
  return Math.max(10, Math.min(TREEMAP_MAX_VISIBLE, totalNodes));
}

function rebalanceDisplayWeights(nodes) {
  if (!nodes.length) {
    return [];
  }

  const largestSize = Math.max(nodes[0]?.size || 0, 1);
  const redistributed = nodes.map((node) => ({
    node,
    weight: Math.max(node.size / largestSize, 0.0015),
  }));

  let previousWeight = Number.POSITIVE_INFINITY;
  return redistributed.map((item, index) => {
    const maxAllowed = index === 0 ? item.weight : Math.max(previousWeight - 0.0005, 0.0005);
    const weight = Math.min(item.weight, maxAllowed);
    previousWeight = weight;
    return { node: item.node, weight };
  });
}

function layoutTreemapBinary(items, rect) {
  if (!items.length || rect.width <= 1 || rect.height <= 1) {
    return [];
  }

  if (items.length === 1) {
    return [
      {
        node: items[0].node,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.max(Math.round(rect.width), 1),
        height: Math.max(Math.round(rect.height), 1),
      },
    ];
  }

  const { firstGroup, secondGroup, firstWeight, totalWeight } = splitItemsByWeight(items);
  if (!firstGroup.length || !secondGroup.length || totalWeight <= 0) {
    return layoutTreemapSlice(items, rect);
  }

  if (rect.width >= rect.height) {
    const firstWidth = clampSize((rect.width * firstWeight) / totalWeight, rect.width);
    const secondWidth = Math.max(rect.width - firstWidth, 1);
    const leftRect = { x: rect.x, y: rect.y, width: firstWidth, height: rect.height };
    const rightRect = {
      x: rect.x + firstWidth,
      y: rect.y,
      width: secondWidth,
      height: rect.height,
    };
    return [
      ...layoutTreemapBinary(firstGroup, leftRect),
      ...layoutTreemapBinary(secondGroup, rightRect),
    ];
  }

  const firstHeight = clampSize((rect.height * firstWeight) / totalWeight, rect.height);
  const secondHeight = Math.max(rect.height - firstHeight, 1);
  const topRect = { x: rect.x, y: rect.y, width: rect.width, height: firstHeight };
  const bottomRect = {
    x: rect.x,
    y: rect.y + firstHeight,
    width: rect.width,
    height: secondHeight,
  };
  return [
    ...layoutTreemapBinary(firstGroup, topRect),
    ...layoutTreemapBinary(secondGroup, bottomRect),
  ];
}

function splitItemsByWeight(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const target = totalWeight / 2;
  let running = 0;
  let splitIndex = 1;

  for (let index = 0; index < items.length - 1; index += 1) {
    running += items[index].weight;
    splitIndex = index + 1;
    if (running >= target) {
      break;
    }
  }

  const firstGroup = items.slice(0, splitIndex);
  const secondGroup = items.slice(splitIndex);
  const firstWeight = firstGroup.reduce((sum, item) => sum + item.weight, 0);
  return { firstGroup, secondGroup, firstWeight, totalWeight };
}

function layoutTreemapSlice(items, rect) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const horizontal = rect.width >= rect.height;
  const result = [];

  if (horizontal) {
    let offsetX = rect.x;
    items.forEach((item, index) => {
      const nextWidth =
        index === items.length - 1
          ? rect.x + rect.width - offsetX
          : (rect.width * item.weight) / Math.max(totalWeight, 1e-9);
      result.push({
        node: item.node,
        x: Math.round(offsetX),
        y: Math.round(rect.y),
        width: Math.max(Math.round(nextWidth), 1),
        height: Math.max(Math.round(rect.height), 1),
      });
      offsetX += nextWidth;
    });
    return result;
  }

  let offsetY = rect.y;
  items.forEach((item, index) => {
    const nextHeight =
      index === items.length - 1
        ? rect.y + rect.height - offsetY
        : (rect.height * item.weight) / Math.max(totalWeight, 1e-9);
    result.push({
      node: item.node,
      x: Math.round(rect.x),
      y: Math.round(offsetY),
      width: Math.max(Math.round(rect.width), 1),
      height: Math.max(Math.round(nextHeight), 1),
    });
    offsetY += nextHeight;
  });
  return result;
}

function clampSize(size, total) {
  return Math.min(Math.max(Math.round(size), 1), Math.max(Math.round(total) - 1, 1));
}

function ensureTreemapTooltip() {
  if (treemapTooltip) {
    return treemapTooltip;
  }
  treemapTooltip = document.createElement('div');
  treemapTooltip.className = 'treemap-tooltip';
  treemapTooltip.hidden = true;
  document.body.appendChild(treemapTooltip);
  return treemapTooltip;
}

function handleTreemapTooltipEnter(event) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const tooltip = ensureTreemapTooltip();
  tooltip.textContent = target.dataset.tooltip || '';
  tooltip.hidden = false;
  positionTreemapTooltip(event);
}

function handleTreemapTooltipMove(event) {
  if (!treemapTooltip || treemapTooltip.hidden) {
    return;
  }
  positionTreemapTooltip(event);
}

function positionTreemapTooltip(event) {
  const tooltip = ensureTreemapTooltip();
  const offset = 14;
  const maxLeft = Math.max(window.innerWidth - tooltip.offsetWidth - 12, 12);
  const maxTop = Math.max(window.innerHeight - tooltip.offsetHeight - 12, 12);
  const left = Math.min(event.clientX + offset, maxLeft);
  const top = Math.min(event.clientY + offset, maxTop);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideTreemapTooltip() {
  if (!treemapTooltip) {
    return;
  }
  treemapTooltip.hidden = true;
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
    return '0.0%';
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

function renderRecentTasks(items) {
  if (!items.length) {
    recentTasks.innerHTML = '<div class="recent-empty">还没有分析记录</div>';
    return;
  }

  recentTasks.innerHTML = items
    .map(
      (item) => `
        <div class="recent-row">
          <div class="recent-header">
            <div class="recent-path">${escapeHtml(item.path)}</div>
            <div class="status-badge">${statusText(item.status)}</div>
          </div>
          <div class="recent-main">
            <div class="recent-meta">
              <span class="recent-meta-chip">${escapeHtml(formatDate(item.createdAt))}</span>
              ${
                item.error
                  ? `<span class="recent-meta-chip recent-meta-chip-danger">${escapeHtml(item.error)}</span>`
                  : ''
              }
            </div>
            <div class="recent-actions">
              <button class="action-link" type="button" data-path="${escapeAttribute(item.path)}">重新分析</button>
              <button class="action-link" type="button" data-task-id="${escapeAttribute(item.id)}">查看结果</button>
              <button class="action-link action-link-danger" type="button" data-delete-id="${escapeAttribute(item.id)}">删除记录</button>
            </div>
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
        setHistoryOpen(false);
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
