(() => {
  'use strict';

  const searchModeGroup = document.getElementById('searchModeGroup');
  const searchBasePathTrigger = document.getElementById('searchBasePathTrigger');
  const searchBasePathLabel = document.getElementById('searchBasePathLabel');
  const searchBasePathMenu = document.getElementById('searchBasePathMenu');
  const searchQuery = document.getElementById('searchQuery');
  const searchSubmitButton = document.getElementById('searchSubmitButton');
  const searchResetButton = document.getElementById('searchResetButton');
  const searchCurrentScope = document.getElementById('searchCurrentScope');
  const searchSummary = document.getElementById('searchSummary');
  const searchResultMeta = document.getElementById('searchResultMeta');
  const searchResultList = document.getElementById('searchResultList');
  const searchTypeFilterGroup = document.getElementById('searchTypeFilterGroup');
  const searchSortSelect = document.getElementById('searchSortSelect');
  const searchSortDirection = document.getElementById('searchSortDirection');
  const searchSelection = document.getElementById('searchSelection');
  const searchChildrenList = document.getElementById('searchChildrenList');
  const searchCopyPathButton = document.getElementById('searchCopyPathButton');
  const searchReindexButton =
    document.getElementById('searchReindexButton') || { disabled: false, addEventListener() {} };

  if (
    !searchModeGroup ||
    !searchBasePathTrigger ||
    !searchBasePathLabel ||
    !searchBasePathMenu ||
    !searchQuery ||
    !searchSubmitButton ||
    !searchResetButton ||
    !searchCurrentScope ||
    !searchSummary ||
    !searchResultMeta ||
    !searchResultList ||
    !searchTypeFilterGroup ||
    !searchSortSelect ||
    !searchSortDirection ||
    !searchSelection ||
    !searchChildrenList ||
    !searchCopyPathButton
  ) {
    return;
  }

  const themeRuntime = window.FNTreeTheme || {};
  const applyTheme = (themeName, options) =>
    themeRuntime.applyTheme ? themeRuntime.applyTheme(themeName, options) : themeName;
  const readSettingsSnapshot = () =>
    themeRuntime.readSettingsSnapshot ? themeRuntime.readSettingsSnapshot() : null;
  const writeSettingsSnapshot = (settings) => {
    if (themeRuntime.writeSettingsSnapshot) {
      themeRuntime.writeSettingsSnapshot(settings);
    }
  };

  const state = {
    theme: 'cinnamon',
    mode: 'quick',
    accessiblePaths: [],
    basePath: '',
    basePathMenuOpen: false,
    rawResults: [],
    results: [],
    selectedPath: '',
    resultFilter: 'all',
    resultSort: 'relevance',
    resultDirection: 'desc',
    selectedChildren: [],
    searchStatus: null,
    searchOptions: {
      quickLimit: 0,
      liveLimit: 0,
    },
  };

  bootstrap().catch((error) => {
    showError(error.message || '初始化搜索页失败');
  });

  searchModeGroup.addEventListener('change', () => {
    state.mode = searchModeGroup.value === 'live' ? 'live' : 'quick';
    renderModeButtons();
  });

  searchBasePathTrigger.addEventListener('click', () => {
    if (!state.accessiblePaths.length) {
      return;
    }
    renderBasePathMenu();
    setBasePathMenuOpen(!state.basePathMenuOpen);
  });

  document.addEventListener('click', (event) => {
    if (!state.basePathMenuOpen) {
      return;
    }
    const target = event.target;
    if (
      target instanceof Node &&
      !searchBasePathTrigger.contains(target) &&
      !searchBasePathMenu.contains(target)
    ) {
      setBasePathMenuOpen(false);
    }
  });

  searchSubmitButton.addEventListener('click', () => {
    runSearch().catch((error) => {
      showError(error.message || '搜索失败');
    });
  });

  searchResetButton.addEventListener('click', () => {
    searchQuery.value = '';
    state.rawResults = [];
    state.results = [];
    state.selectedPath = '';
    state.selectedChildren = [];
    renderResults();
    void renderSelection(null);
    searchResultMeta.textContent = '已清空结果';
  });

  searchTypeFilterGroup.addEventListener('change', () => {
    state.resultFilter = normalizeResultFilter(searchTypeFilterGroup.value);
    applyResultView();
  });

  searchSortSelect.addEventListener('change', () => {
    state.resultSort = normalizeResultSort(searchSortSelect.value);
    applyResultView();
  });

  searchSortDirection.addEventListener('change', () => {
    state.resultDirection = normalizeSortDirection(searchSortDirection.value);
    applyResultView();
  });

  searchQuery.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch().catch((error) => {
        showError(error.message || '搜索失败');
      });
    }
  });

  searchCopyPathButton.addEventListener('click', async () => {
    const item = state.results.find((entry) => entry.path === state.selectedPath);
    if (!item) {
      showError('当前没有可复制的搜索结果');
      return;
    }

    try {
      await copyText(item.path);
      showMessage('路径已复制');
    } catch {
      showError('复制失败，请手动复制路径');
    }
  });

  searchReindexButton.addEventListener('click', () => {
    rebuildSearchIndex().catch((error) => {
      showError(error.message || '重建索引失败');
    });
  });

  async function bootstrap() {
    const cachedSettings = readSettingsSnapshot();
    if (cachedSettings) {
      applyTheme(cachedSettings.theme || 'cinnamon');
    }

    const settings = await fetchJson('/api/settings');
    state.theme = settings.theme || 'cinnamon';
    state.accessiblePaths = Array.isArray(settings.accessiblePaths) ? settings.accessiblePaths : [];
    state.searchStatus = settings.searchStatus || null;
    state.searchOptions = {
      ...state.searchOptions,
      ...(settings.searchOptions || {}),
    };
    applyTheme(state.theme);
    writeSettingsSnapshot(settings);

    await refreshSearchStatus();
    renderModeButtons();
    renderAccessiblePaths();
    renderSearchStatus();
    renderResultControls();
    searchSummary.hidden = true;
  }

  function renderModeButtons() {
    searchModeGroup.value = state.mode;
  }

  function renderAccessiblePaths() {
    state.basePath = '';
    searchBasePathMenu.innerHTML = '';
    updateBasePathTrigger('全部已授权目录');
    renderCurrentScope();
    renderBasePathMenu();
  }

  function renderBasePathMenu() {
    searchBasePathMenu.innerHTML = '';

    const createOption = (label, value) => {
      const option = document.createElement('button');
      option.className = 'path-picker-option';
      option.type = 'button';
      option.textContent = label;
      option.dataset.path = value;
      option.addEventListener('click', () => {
        state.basePath = value;
        updateBasePathTrigger(label);
        renderCurrentScope();
        setBasePathMenuOpen(false);
      });
      return option;
    };

    searchBasePathMenu.appendChild(createOption('全部已授权目录', ''));
    for (const item of state.accessiblePaths) {
      searchBasePathMenu.appendChild(createOption(item, item));
    }
  }

  function setBasePathMenuOpen(open) {
    state.basePathMenuOpen = open;
    searchBasePathMenu.hidden = !open;
    searchBasePathTrigger.classList.toggle('is-open', open);
  }

  function updateBasePathTrigger(label) {
    searchBasePathLabel.textContent = label;
    searchBasePathTrigger.setAttribute('title', label);
    searchBasePathTrigger.setAttribute('aria-label', label);
  }

  function renderCurrentScope() {
    searchCurrentScope.textContent = `当前目录：${state.basePath || '全部已授权目录'}`;
  }

  function renderSearchStatus() {
    const quick = state.searchStatus?.quickBackend;
    const indexer = state.searchStatus?.quickIndexer;
    const live = state.searchStatus?.liveBackend;
    const index = state.searchStatus?.index;
    searchReindexButton.disabled = !indexer?.available || Boolean(index?.running);
    window.__fntreeSearchStatusUpdate?.(state.searchStatus);
  }

  async function runSearch() {
    const query = searchQuery.value.trim();
    if (!query) {
      throw new Error('请输入要搜索的关键词');
    }
    searchSubmitButton.loading = true;
    searchResultMeta.textContent = '搜索中';

    try {
      const response = await fetchJson('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: state.mode,
          query,
          basePath: state.basePath,
          limit: 0,
        }),
      });

      state.rawResults = Array.isArray(response.items) ? response.items : [];
      applyResultView({
        backend: shortCommandName(response.backend),
        total: Number(response.total || state.rawResults.length),
      });
    } finally {
      searchSubmitButton.loading = false;
    }
  }

  function renderResultControls() {
    searchTypeFilterGroup.value = state.resultFilter;
    searchSortSelect.value = state.resultSort;
    searchSortDirection.value = state.resultDirection;
  }

  function applyResultView(context = null) {
    const filtered = state.rawResults
      .filter((item) => {
        if (state.resultFilter === 'directory') {
          return item.type === 'directory';
        }
        if (state.resultFilter === 'file') {
          return item.type === 'file';
        }
        return true;
      })
      .slice();

    if (state.resultSort === 'size') {
      filtered.sort((a, b) => Number(a.size || 0) - Number(b.size || 0));
    } else if (state.resultSort === 'mtime') {
      filtered.sort((a, b) => Date.parse(a.mtime || 0) - Date.parse(b.mtime || 0));
    } else if (state.resultSort === 'name') {
      filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
    }

    if (state.resultSort !== 'relevance' && state.resultDirection === 'desc') {
      filtered.reverse();
    }

    state.results = filtered;
    if (!filtered.some((item) => item.path === state.selectedPath)) {
      state.selectedPath = filtered[0]?.path || '';
    }
    renderResultControls();
    renderResults();
    void renderSelection(filtered.find((item) => item.path === state.selectedPath) || null);

    if (context) {
      const total = context.total ?? state.rawResults.length;
      const filteredLabel =
        filtered.length === total ? `${total} 项结果` : `${total} 项结果，当前显示 ${filtered.length} 项`;
      searchResultMeta.textContent = `${context.backend || '搜索'} 返回 ${filteredLabel}`;
    } else if (!filtered.length && state.rawResults.length) {
      searchResultMeta.textContent = '当前筛选条件下没有结果';
    }
  }

  async function refreshSearchStatus() {
    const status = await fetchJson('/api/search/status');
    state.searchStatus = status;
  }

  async function rebuildSearchIndex() {
    searchReindexButton.disabled = true;

    try {
      const response = await fetchJson('/api/search/reindex', { method: 'POST' });
      if (response?.searchStatus) {
        state.searchStatus = response.searchStatus;
        renderSearchStatus();
      }
      await waitForReindexCompletion();
    } finally {
      searchReindexButton.disabled = false;
    }
  }

  async function waitForReindexCompletion() {
    const maxRounds = 80;

    for (let round = 0; round < maxRounds; round += 1) {
      await delay(1500);
      await refreshSearchStatus();
      renderSearchStatus();
      const index = state.searchStatus?.index;

      if (index?.running) {
        continue;
      }

      if (index?.lastError) {
        showError(`索引重建失败：${index.lastError}`);
        return;
      }

      if (index?.updatedAt) {
        showMessage('索引重建完成');
        return;
      }

      return;
    }
  }

  function renderResults() {
    if (!state.results.length) {
      searchResultList.className = 'search-result-list list-empty';
      searchResultList.textContent = '没有搜索结果';
      return;
    }

    searchResultList.className = 'search-result-list';
    searchResultList.innerHTML = state.results
      .map((item) => {
        const selected = item.path === state.selectedPath ? ' is-selected' : '';
        const name = item.name || item.path;
        const metaText = `${item.type === 'directory' ? '目录' : '文件'} / ${item.parent || ''}`;
        return `
          <button class="search-result-item${selected}" type="button" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
            <div class="search-result-main">
              <div class="search-result-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
              <div class="search-result-meta" title="${escapeHtml(metaText)}">${escapeHtml(metaText)}</div>
            </div>
            <div class="search-result-side">
              <div class="search-result-size">${formatBytes(item.size || 0)}</div>
              <div class="search-result-date">${formatTime(item.mtime)}</div>
            </div>
          </button>
        `;
      })
      .join('');

    searchResultList.querySelectorAll('[data-path]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedPath = button.dataset.path || '';
        renderResults();
        void renderSelection(state.results.find((item) => item.path === state.selectedPath) || null);
      });
    });
  }

  async function renderSelection(item) {
    if (!item) {
      searchSelection.className = 'selection-empty';
      searchSelection.textContent = '点击左侧结果查看详情';
      renderChildren([]);
      return;
    }

    searchSelection.className = 'search-selection';
    searchSelection.innerHTML = `
      <div class="selection-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
      <div class="detail-grid">
        <div class="detail-card">
          <span>类型</span>
          <strong>${item.type === 'directory' ? '目录' : '文件'}</strong>
        </div>
        <div class="detail-card">
          <span>大小</span>
          <strong>${formatBytes(item.size || 0)}</strong>
        </div>
        <div class="detail-card">
          <span>上级目录</span>
          <strong>${escapeHtml(item.parent || '-')}</strong>
        </div>
        <div class="detail-card">
          <span>修改时间</span>
          <strong>${formatTime(item.mtime)}</strong>
        </div>
      </div>
    `;

    if (item.type === 'directory') {
      try {
        const response = await fetchJson(`/api/search/children?path=${encodeURIComponent(item.path)}`);
        state.selectedChildren = Array.isArray(response.items) ? response.items : [];
        renderChildren(state.selectedChildren);
      } catch (error) {
        renderChildren([], error.message || '读取目录内容失败');
      }
      return;
    }

    state.selectedChildren = [];
    renderChildren([]);
  }

  function renderChildren(items, errorMessage = '') {
    if (errorMessage) {
      searchChildrenList.className = 'list-empty';
      searchChildrenList.textContent = errorMessage;
      return;
    }

    if (!items.length) {
      searchChildrenList.className = 'list-empty';
      searchChildrenList.textContent = state.selectedPath ? '当前未选中文件夹或目录为空' : '当前未选中文件夹';
      return;
    }

    searchChildrenList.className = '';
    searchChildrenList.innerHTML = items
      .map(
        (item) => `
          <button class="list-row" type="button" data-path="${escapeHtml(item.path)}">
            <div>
              <strong>${escapeHtml(item.name || item.path)}</strong>
              <div class="list-meta">${item.type === 'directory' ? '目录' : '文件'} / ${formatTime(item.mtime)}</div>
            </div>
            <strong>${formatBytes(item.size || 0)}</strong>
          </button>
        `,
      )
      .join('');

    searchChildrenList.querySelectorAll('[data-path]').forEach((button) => {
      button.addEventListener('click', () => {
        const nextPath = button.dataset.path || '';
        const nextItem = state.selectedChildren.find((item) => item.path === nextPath);
        if (!nextItem) {
          return;
        }
        state.selectedPath = nextPath;
        void renderSelection(nextItem);
      });
    });
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || '请求失败');
    }
    return payload;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  }

  function formatBytes(value) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let next = Number(value) || 0;
    let unit = units[0];
    for (let index = 1; index < units.length && next >= 1024; index += 1) {
      next /= 1024;
      unit = units[index];
    }
    return `${next >= 10 || unit === 'B' ? next.toFixed(0) : next.toFixed(1)} ${unit}`;
  }

  function formatTime(value) {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function shortCommandName(command) {
    if (!command) {
      return '';
    }
    const normalized = String(command).replaceAll('\\', '/');
    const parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, Math.round(parsed)));
  }

  function normalizeResultFilter(value) {
    return value === 'directory' || value === 'file' ? value : 'all';
  }

  function normalizeResultSort(value) {
    return ['relevance', 'size', 'mtime', 'name'].includes(value)
      ? value
      : 'relevance';
  }

  function normalizeSortDirection(value) {
    return value === 'asc' ? 'asc' : 'desc';
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  function showMessage(message) {
    if (window.mdui?.snackbar) {
      window.mdui.snackbar({ message });
      return;
    }
    window.alert(message);
  }

  function showError(message) {
    showMessage(message);
  }

})();
