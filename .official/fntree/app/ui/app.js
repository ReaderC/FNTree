const state = {
  taskId: null,
  pollTimer: null,
  localTaskStartedAt: null,
  accessiblePaths: [],
  searchStatus: null,
  rootNode: null,
  zoomPath: [],
  selectedPath: null,
  detailLevel: 0,
  menuOpen: false,
  historyOpen: false,
  pathMenuRendered: false,
  treemapFilter: 'all',
  treemapMaxVisible: 24,
  layoutCache: new Map(),
};

const SETTINGS_CACHE_KEY = 'fntree.settings';
const HEALTH_CACHE_KEY = 'fntree.health';
const TASKS_CACHE_KEY = 'fntree.tasks';
const CACHE_TTL_MS = 5 * 60 * 1000;
const themeRuntime = window.FNTreeTheme || {};
const applyTheme = (themeName, options) =>
  themeRuntime.applyTheme ? themeRuntime.applyTheme(themeName, options) : themeName;
const readSettingsSnapshot = () =>
  themeRuntime.readSettingsSnapshot ? themeRuntime.readSettingsSnapshot() : readCacheItem(SETTINGS_CACHE_KEY);
const writeSettingsSnapshot = (settings) => {
  if (themeRuntime.writeSettingsSnapshot) {
    themeRuntime.writeSettingsSnapshot(settings);
    return;
  }
  writeCacheItem(SETTINGS_CACHE_KEY, settings);
};

const pathInput = document.getElementById('pathInput');
const analyzeButton = document.getElementById('analyzeButton');
const accessiblePathTrigger = document.getElementById('accessiblePathTrigger');
const accessiblePathMenu = document.getElementById('accessiblePathMenu');
const accessiblePathsEmpty = document.getElementById('accessiblePathsEmpty');
const accessiblePathsList = document.getElementById('accessiblePathsList');
const taskStatus = document.getElementById('taskStatus');
const taskProgress = document.getElementById('taskProgress');
const scanOptionsSummary = document.getElementById('scanOptionsSummary');
const treemapView = document.getElementById('treemapView');
const breadcrumbBar = document.getElementById('breadcrumbBar');
const selectionDetails = document.getElementById('selectionDetails');
const childrenList = document.getElementById('childrenList');
const recentTasks = document.getElementById('recentTasks');
const historyToggleButton = document.getElementById('historyToggleButton');
const importResultButton = document.getElementById('importResultButton');
const historyCloseButton = document.getElementById('historyCloseButton');
const historyDrawer = document.getElementById('historyDrawer');
const historyBackdrop = document.getElementById('historyBackdrop');
const healthLabel = document.getElementById('healthLabel');
const gduLabel = document.getElementById('gduLabel');
const heroEyebrow = document.getElementById('heroEyebrow');
const heroCopy = document.getElementById('heroCopy');
const heroTreeTab = document.getElementById('heroTreeTab');
const heroSearchTab = document.getElementById('heroSearchTab');
const analysisStage = document.getElementById('analysisStage');
const searchStage = document.getElementById('searchStage');
const detailLevelLabel = document.getElementById('detailLevelLabel');
const copyPathButton = document.getElementById('copyPathButton');
const exportResultButton = document.getElementById('exportResultButton');
const clearTasksButton = document.getElementById('clearTasksButton');
const treemapFilter = document.getElementById('treemapFilter');
const importResultInput = document.getElementById('importResultInput');
const TREEMAP_MAX_VISIBLE = 24;
let treemapTooltip = null;
const VIEW_COPY = {
  tree: {
    eyebrow: 'FNOS Storage Analyzer',
    copy: '用 treemap 查看目录和文件占用。块越大，占用越高；点击即可逐层下钻。',
  },
  search: {
    eyebrow: 'FNOS File Search',
    copy: '快速搜索走索引，实时搜索走当前文件系统。搜索和分析共用同一套授权目录。',
  },
};

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
  ensureAccessiblePathMenu();
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


clearTasksButton.addEventListener('click', () => {
  clearTasks().catch((error) => {
    showError(error.message || '清空记录失败');
  });
});

historyToggleButton?.addEventListener('click', () => {
  setHistoryOpen(true);
});

importResultButton?.addEventListener('click', () => {
  importResultInput?.click();
});

historyCloseButton?.addEventListener('click', () => {
  setHistoryOpen(false);
});

historyBackdrop?.addEventListener('click', () => {
  setHistoryOpen(false);
});

exportResultButton?.addEventListener('click', () => {
  exportCurrentResult().catch((error) => {
    showError(error.message || '导出结果失败');
  });
});

importResultInput?.addEventListener('change', () => {
  importResultFromFile().catch((error) => {
    showError(error.message || '导入结果失败');
  });
});

treemapFilter?.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.treemapFilter = button.dataset.filter || 'all';
    renderTreemapFilter();
    state.detailLevel = 0;
    state.layoutCache = new Map();
    renderWorkspace();
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.historyOpen) {
    setHistoryOpen(false);
  }
});

heroTreeTab?.addEventListener('click', () => {
  setAppMode('tree');
});

heroSearchTab?.addEventListener('click', () => {
  setAppMode('search');
});

window.addEventListener('resize', throttle(renderTreemapOnly, 120));
window.addEventListener('hashchange', syncModeFromLocation);
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
  const cachedSettings = readSettingsSnapshot();
  const cachedHealth = readCacheItem(HEALTH_CACHE_KEY, CACHE_TTL_MS);
  const cachedTasks = readCacheItem(TASKS_CACHE_KEY, CACHE_TTL_MS);

  if (cachedSettings || cachedHealth || cachedTasks) {
    hydrateDashboard({
      settings: cachedSettings,
      health: cachedHealth,
      tasks: cachedTasks,
    });
  } else {
    clearWorkspace();
  }

  const [healthResult, settingsResult, tasksResult] = await Promise.allSettled([
    fetchJson('/api/health'),
    fetchJson('/api/settings'),
    fetchJson('/api/tasks'),
  ]);

  const health = healthResult.status === 'fulfilled' ? healthResult.value : cachedHealth;
  const settings = settingsResult.status === 'fulfilled' ? settingsResult.value : cachedSettings;
  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : cachedTasks;

  if (!settings) {
    throw new Error('璇诲彇璁剧疆澶辫触');
  }

  hydrateDashboard({ settings, health, tasks });
}

function syncModeFromLocation() {
  const nextMode = window.location.hash === '#search' ? 'search' : 'tree';
  setAppMode(nextMode, { updateHash: false });
}

function setAppMode(mode, options = {}) {
  const nextMode = mode === 'search' ? 'search' : 'tree';
  document.body.classList.toggle('mode-search', nextMode === 'search');
  document.body.classList.toggle('mode-tree', nextMode === 'tree');
  analysisStage?.classList.toggle('is-active', nextMode === 'tree');
  searchStage?.classList.toggle('is-active', nextMode === 'search');
  heroTreeTab?.classList.toggle('is-active', nextMode === 'tree');
  heroSearchTab?.classList.toggle('is-active', nextMode === 'search');

  if (heroEyebrow) {
    heroEyebrow.textContent = VIEW_COPY[nextMode].eyebrow;
  }
  if (heroCopy) {
    heroCopy.textContent = VIEW_COPY[nextMode].copy;
  }
  renderServiceCard(nextMode);

  if (options.updateHash !== false) {
    const nextHash = nextMode === 'search' ? '#search' : '#tree';
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }
}

function renderAccessiblePaths() {
  accessiblePathsList.innerHTML = '';
  accessiblePathMenu.innerHTML = '';
  state.pathMenuRendered = false;

  if (!state.accessiblePaths.length) {
    accessiblePathsEmpty.textContent = '当前没有授权目录，请先在 FNOS 应用设置里授权。';
    accessiblePathTrigger.textContent = '请选择已授权目录';
    pathInput.value = '';
    return;
  }

  accessiblePathsEmpty.textContent = '';

  state.accessiblePaths.slice(0, 3).forEach((item, index) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item;
    accessiblePathsList.append(chip);

    if (index === 0) {
      accessiblePathTrigger.textContent = item;
      pathInput.value = item;
    }
  });

  if (state.accessiblePaths.length > 3) {
    const chip = document.createElement('span');
    chip.className = 'chip chip-muted';
    chip.textContent = `共 ${state.accessiblePaths.length} 个授权目录`;
    accessiblePathsList.append(chip);
  }
}

function setPathMenuOpen(open) {
  state.menuOpen = open;
  accessiblePathMenu.hidden = !open;
  accessiblePathTrigger.classList.toggle('is-open', open);
}

function ensureAccessiblePathMenu() {
  if (state.pathMenuRendered) {
    return;
  }

  accessiblePathMenu.innerHTML = '';
  state.accessiblePaths.forEach((item) => {
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
  });

  state.pathMenuRendered = true;
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
  analyzeButton.disabled = true;
  state.localTaskStartedAt = Date.now();
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
    analyzeButton.disabled = false;
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
  renderSelection();
  renderChildrenList();
  renderBreadcrumb();
  requestAnimationFrame(() => {
    renderTreemapOnly();
  });
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
    element.style.borderRadius = `${computeNodeRadius(item)}px`;
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

function computeNodeRadius(item) {
  const shortest = Math.max(Math.min(item.width, item.height), 1);
  return Math.max(Math.min(shortest * 0.16, 20), 8);
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

  requestAnimationFrame(() => {
    breadcrumbBar.scrollLeft = breadcrumbBar.scrollWidth;
  });
}

function clearWorkspace() {
  state.rootNode = null;
  state.zoomPath = [];
  state.selectedPath = null;
  state.detailLevel = 0;
  state.layoutCache = new Map();
  if (taskProgress) {
    taskProgress.textContent = '等待扫描任务';
  }
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

async function clearTasks() {
  await fetchJson('/api/tasks', { method: 'DELETE' });
  await refreshRecentTasks();
  showMessage('任务记录已清空');
}

async function refreshRecentTasks() {
  const tasks = await fetchJson('/api/tasks');
  renderRecentTasks(tasks.items || []);
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

function renderTask(task) {
  if (task.status === 'failed') {
    taskStatus.textContent = `分析失败: ${task.error || '未知错误'}`;
    if (taskProgress) {
      taskProgress.textContent = task.stderr ? lastProgressLine(task.stderr) : '扫描已中断';
    }
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
    if (taskProgress) {
      taskProgress.textContent = `扫描完成，用时 ${formatTaskElapsed(task)}`;
    }
    state.rootNode = task.result?.root || null;
    state.zoomPath = [];
    state.selectedPath = state.rootNode?.path || null;
    state.detailLevel = 0;
    state.layoutCache = new Map();
    renderWorkspace();
    return;
  }

  taskStatus.textContent = `分析中，已读取 ${formatBytes(task.stdoutBytes || 0)}`;
  if (taskProgress) {
    taskProgress.textContent = task.stderr
      ? lastProgressLine(task.stderr)
      : `正在扫描，已运行 ${formatTaskElapsed(task)}`;
  }
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
    .filter((child) => matchesTreemapFilter(child))
    .filter((child) => child.size > 0)
    .sort((a, b) => b.size - a.size);

  if (!entries.length) {
    treemapView.className = 'treemap-empty';
    treemapView.innerHTML = '<div class="treemap-empty">当前筛选下没有可展示的子项</div>';
    detailLevelLabel.textContent = '滚轮细化 0';
    return;
  }

  treemapView.className = '';
  const width = treemapView.clientWidth || 860;
  const height = treemapView.clientHeight || 660;
  const layout = computeSquarifiedTreemap(entries, { x: 0, y: 0, width, height });
  const currentTotal = Math.max(entries[0]?.size || sumNodeSize(entries), 1);
  detailLevelLabel.textContent = `滚轮细化 ${state.detailLevel}`;
  patchTreemapNodes(layout, currentTotal);
}

function renderChildrenList() {
  const node = getCurrentNode();
  if (!node) {
    childrenList.className = 'list-empty';
    childrenList.innerHTML = '<div class="list-empty">等待结果</div>';
    return;
  }

  const items = (node.children || [])
    .filter((child) => matchesTreemapFilter(child))
    .slice()
    .sort((a, b) => b.size - a.size);

  if (!items.length) {
    childrenList.className = 'list-empty';
    childrenList.innerHTML = '<div class="list-empty">当前筛选下没有子项</div>';
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

function renderTreemapFilter() {
  treemapFilter?.querySelectorAll('[data-filter]').forEach((button) => {
    const selected = button.dataset.filter === state.treemapFilter;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function matchesTreemapFilter(node) {
  if (state.treemapFilter === 'directory') {
    return node.type === 'directory';
  }
  if (state.treemapFilter === 'file') {
    return node.type === 'file';
  }
  return true;
}

function formatDuration(startedAt, finishedAt) {
  if (!startedAt) {
    return '0 秒';
  }
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return '-';
  }
  const totalSeconds = Math.max(Math.round((end - start) / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} 秒`;
  }
  return `${minutes} 分 ${seconds} 秒`;
}

function formatTaskElapsed(task) {
  if (task?.id === state.taskId && Number.isFinite(state.localTaskStartedAt)) {
    const end = task.finishedAt ? Date.parse(task.finishedAt) : Date.now();
    if (!Number.isNaN(end)) {
      return formatDurationFromMs(Math.max(end - state.localTaskStartedAt, 0));
    }
  }

  return formatDuration(task?.startedAt, task?.finishedAt);
}

function formatDurationFromMs(durationMs) {
  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} 秒`;
  }
  return `${minutes} 分 ${seconds} 秒`;
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function lastProgressLine(stderr) {
  const lines = String(stderr || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || '正在扫描';
}

function readCacheItem(key, ttlMs = 0) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (ttlMs && parsed.updatedAt && Date.now() - parsed.updatedAt > ttlMs) {
      return null;
    }
    return parsed.value ?? null;
  } catch {
    return null;
  }
}

function writeCacheItem(key, value) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        updatedAt: Date.now(),
        value,
      }),
    );
  } catch {
    // Ignore cache failures.
  }
}

function mix(baseHex, accentHex, amount) {
  const base = hexToRgb(baseHex);
  const accent = hexToRgb(accentHex);
  const ratio = Math.max(0, Math.min(1, amount));
  return rgbToHex({
    r: Math.round(base.r + (accent.r - base.r) * ratio),
    g: Math.round(base.g + (accent.g - base.g) * ratio),
    b: Math.round(base.b + (accent.b - base.b) * ratio),
  });
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex) {
  const clean = String(hex || '')
    .trim()
    .replace('#', '');
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : clean;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

async function exportCurrentResult() {
  if (!state.rootNode) {
    throw new Error('当前没有可导出的扫描结果');
  }

  let task = null;
  if (state.taskId) {
    try {
      task = await fetchJson(`/api/analyze/${state.taskId}`);
    } catch {
      task = null;
    }
  }

  const payload = buildExportPayload(task, state.rootNode);
  downloadExportPayload(payload);
  showMessage('扫描结果已导出');
}

async function exportTaskById(taskId) {
  const task = await fetchJson(`/api/analyze/${taskId}`);
  if (!task?.result?.root) {
    throw new Error('该任务没有可导出的结果');
  }

  const payload = buildExportPayload(task, task.result.root);
  downloadExportPayload(payload);
  showMessage('扫描结果已导出');
}

function buildExportPayload(task, rootNode) {
  return {
    format: 'fntree-scan-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    source: task?.id ? 'task' : 'workspace',
    task: task
      ? {
          id: task.id,
          path: task.path,
          createdAt: task.createdAt,
          finishedAt: task.finishedAt,
          scanOptions: task.scanOptions || null,
        }
      : {
          id: null,
          path: rootNode?.path || '',
          createdAt: null,
          finishedAt: null,
          scanOptions: null,
        },
    result: task?.result || {
      root: rootNode,
      largest: [],
    },
  };
}

function downloadExportPayload(payload) {
  const pathLabel = sanitizeFilePart(payload.task?.path || payload.result?.root?.path || 'scan');
  const timestamp = new Date()
    .toISOString()
    .replace(/[:T]/g, '-')
    .replace(/\..+$/, '');
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${pathLabel}-${timestamp}.fntree.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function importResultFromFile() {
  const file = importResultInput?.files?.[0];
  if (!file) {
    return;
  }

  const content = await file.text();
  const payload = JSON.parse(content);
  const root = payload?.format === 'fntree-scan-export' ? payload?.result?.root : payload?.root;

  if (!root || typeof root !== 'object' || !root.path) {
    throw new Error('导入文件格式不正确');
  }

  state.taskId = null;
  state.rootNode = root;
  state.zoomPath = [];
  state.selectedPath = root.path;
  state.detailLevel = 0;
  state.layoutCache = new Map();
  taskStatus.textContent = `已导入结果: ${payload?.task?.path || root.path}`;
  taskProgress.textContent = payload?.exportedAt
    ? `导出时间 ${formatDate(payload.exportedAt)}`
    : '已从文件导入结果';
  renderWorkspace();
  showMessage('扫描结果已导入');

  if (importResultInput) {
    importResultInput.value = '';
  }
}

function sanitizeFilePart(value) {
  return String(value || 'scan')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(-80);
}

function renderRecentTasks(items) {
  if (!items.length) {
    recentTasks.innerHTML = '<div class="recent-empty">还没有分析记录</div>';
    writeCacheItem(TASKS_CACHE_KEY, { items: [] });
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
              ${
                item.status === 'completed'
                  ? `<button class="action-link" type="button" data-export-id="${escapeAttribute(item.id)}">导出结果</button>`
                  : ''
              }
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

  recentTasks.querySelectorAll('[data-export-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await exportTaskById(button.dataset.exportId);
      } catch (error) {
        showError(error.message || '导出结果失败');
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

  writeCacheItem(TASKS_CACHE_KEY, { items });
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
    .filter((child) => matchesTreemapFilter(child))
    .filter((child) => child.size > 0)
    .sort((a, b) => b.size - a.size);

  if (!entries.length) {
    treemapView.className = 'treemap-empty';
    treemapView.innerHTML = '<div class="treemap-empty">当前筛选下没有可展示的子项</div>';
    detailLevelLabel.textContent = '滚轮细化 0';
    return;
  }

  treemapView.className = '';
  const width = treemapView.clientWidth || 860;
  const height = treemapView.clientHeight || 660;
  const layout = computeSquarifiedTreemap(entries, { x: 0, y: 0, width, height });
  const visualTotal = Math.max(entries[0]?.size || sumNodeSize(entries), 1);
  const labelTotal = Math.max(currentNode.size || sumNodeSize(entries), 1);
  detailLevelLabel.textContent = `滚轮细化 ${state.detailLevel}`;
  patchTreemapNodes(layout, visualTotal, labelTotal);
}

function patchTreemapNodes(layout, visualTotal, labelTotal) {
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
    element.style.background = nodeFill(item.node, visualTotal);
    element.style.borderRadius = `${computeNodeRadius(item)}px`;
    element.innerHTML = renderNodeBody(item.node, item, labelTotal, labelMode);

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

function renderScanOptions(scanOptions) {
  const labels = [];
  labels.push(scanOptions.scanMode === 'apparent-size' ? '表观大小' : '磁盘占用');
  labels.push(scanOptions.ignoreHidden ? '忽略隐藏目录' : '包含隐藏目录');
  labels.push(scanOptions.noCross ? '不跨文件系统' : '允许跨文件系统');
  labels.push(scanOptions.followSymlinks ? '跟随符号链接' : '不跟随符号链接');
  labels.push(scanOptions.sequential ? '顺序扫描' : '并发扫描');
  labels.push(`前 ${scanOptions.topLimit || 30} 项`);
  labels.push(`Treemap 最多 ${scanOptions.treemapMaxVisible || 24} 块`);
  scanOptionsSummary.textContent = labels.join(' / ');
}

function getVisibleTreemapCount(totalNodes) {
  const configured = Number(state.treemapMaxVisible || 24);
  const visibleLimit = Math.max(5, Math.min(30, configured));
  return Math.max(5, Math.min(visibleLimit, totalNodes));
}

breadcrumbBar.addEventListener(
  'wheel',
  (event) => {
    if (Math.abs(event.deltaY) < Math.abs(event.deltaX) && Math.abs(event.deltaX) < 1) {
      return;
    }
    event.preventDefault();
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    breadcrumbBar.scrollLeft += delta;
  },
  { passive: false },
);

function shortCommandName(command) {
  if (!command) {
    return '未就绪';
  }
  const parts = String(command).split('/');
  return parts[parts.length - 1] || String(command);
}

function renderServiceCard(mode) {
  if (!healthLabel || !gduLabel) {
    return;
  }

  if (mode === 'search') {
    renderSearchServiceStatus();
    return;
    const quick = state.searchStatus?.quickBackend;
    const live = state.searchStatus?.liveBackend;
    const index = state.searchStatus?.index;
    const quickText = quick?.available ? shortCommandName(quick.command) : '未就绪';
    const liveText = live?.available ? shortCommandName(live.command) : '未就绪';
    const indexText = index?.running
      ? '索引构建中'
      : index?.updatedAt
        ? '索引已就绪'
        : index?.lastError
          ? '索引失败'
          : '索引缺失';
    const available = Boolean(quick?.available || live?.available);

    healthLabel.textContent = available ? '搜索可用' : '搜索受限';
    gduLabel.textContent = `快速：${quickText} / 实时：${liveText} / ${indexText}`;
    return;
  }

  const health = window.__fntreeHealth || {};
  const settings = window.__fntreeSettings || {};
  healthLabel.textContent = health.ok ? '服务正常' : '服务异常';
  gduLabel.textContent = health.gduAvailable
    ? `gdu 已就绪 · ${settings.gduBinary || ''}`
    : `缺少 gdu · ${settings.gduBinary || ''}`;
}

function renderSearchServiceStatus() {
  const quick = state.searchStatus?.quickBackend;
  const live = state.searchStatus?.liveBackend;
  const index = state.searchStatus?.index;
  const quickText = quick?.available ? shortCommandName(quick.command) : '未就绪';
  const liveText = live?.available ? shortCommandName(live.command) : '未就绪';
  const indexText = index?.running
    ? '索引构建中'
    : index?.updatedAt
      ? `索引已就绪 ${formatDate(index.updatedAt)}`
      : index?.lastError
        ? '索引失败'
        : '索引缺失';
  const available = Boolean(quick?.available || live?.available);

  healthLabel.textContent = available ? '搜索可用' : '搜索受限';
  gduLabel.textContent = `快速：${quickText} / 实时：${liveText} / ${indexText}`;
}

function hydrateDashboard({ settings, health, tasks }) {
  if (settings) {
    state.accessiblePaths = settings.accessiblePaths || [];
    state.searchStatus = settings.searchStatus || state.searchStatus;
    state.treemapMaxVisible = Number(settings.scanOptions?.treemapMaxVisible || 24);
    applyTheme(settings.theme || 'cinnamon');
    renderAccessiblePaths();
    renderScanOptions(settings.scanOptions || {});
    window.__fntreeSettings = settings;
    writeSettingsSnapshot(settings);
  }

  if (health) {
    window.__fntreeHealth = health;
    writeCacheItem(HEALTH_CACHE_KEY, health);
  }

  const mode = document.body.classList.contains('mode-search') ? 'search' : 'tree';
  renderServiceCard(mode);
  renderTreemapFilter();

  if (Array.isArray(tasks?.items)) {
    renderRecentTasks(tasks.items);
  }

  if (!state.rootNode) {
    clearWorkspace();
  }
}

window.__fntreeSearchStatusUpdate = (status) => {
  state.searchStatus = status || null;
  const mode = document.body.classList.contains('mode-search') ? 'search' : 'tree';
  renderServiceCard(mode);
};
