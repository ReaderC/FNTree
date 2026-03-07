(() => {
  'use strict';

  const searchModeGroup = document.getElementById('searchModeGroup');
  const searchBasePath = document.getElementById('searchBasePath');
  const searchQuery = document.getElementById('searchQuery');
  const searchLimit = document.getElementById('searchLimit');
  const searchSubmitButton = document.getElementById('searchSubmitButton');
  const searchResetButton = document.getElementById('searchResetButton');
  const searchSummary = document.getElementById('searchSummary');
  const searchResultMeta = document.getElementById('searchResultMeta');
  const searchResultList = document.getElementById('searchResultList');
  const searchSelection = document.getElementById('searchSelection');
  const searchCopyPathButton = document.getElementById('searchCopyPathButton');
  const searchReindexButton =
    document.getElementById('searchReindexButton') || { disabled: false, addEventListener() {} };

  if (
    !searchModeGroup ||
    !searchBasePath ||
    !searchQuery ||
    !searchLimit ||
    !searchSubmitButton ||
    !searchResetButton ||
    !searchSummary ||
    !searchResultMeta ||
    !searchResultList ||
    !searchSelection ||
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
    results: [],
    selectedPath: '',
    searchStatus: null,
    searchOptions: {
      quickLimit: 50,
      liveLimit: 50,
    },
  };

  bootstrap().catch((error) => {
    showError(error.message || '初始化搜索页失败');
  });

  searchModeGroup.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode === 'live' ? 'live' : 'quick';
      renderModeButtons();
      updateLimitFromSettings();
    });
  });

  searchSubmitButton.addEventListener('click', () => {
    runSearch().catch((error) => {
      showError(error.message || '搜索失败');
    });
  });

  searchResetButton.addEventListener('click', () => {
    searchQuery.value = '';
    state.results = [];
    state.selectedPath = '';
    renderResults();
    renderSelection(null);
    searchResultMeta.textContent = '已清空结果';
    searchSummary.textContent = '等待下一次搜索';
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
    state.searchOptions = settings.searchOptions || state.searchOptions;
    applyTheme(state.theme);
    writeSettingsSnapshot(settings);

    await refreshSearchStatus();
    renderModeButtons();
    renderAccessiblePaths();
    renderSearchStatus();
    updateLimitFromSettings();
    searchSummary.textContent = '已加载搜索能力，输入关键词即可搜索';
  }

  function renderModeButtons() {
    searchModeGroup.querySelectorAll('[data-mode]').forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  function renderAccessiblePaths() {
    searchBasePath.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = '全部已授权目录';
    searchBasePath.appendChild(allOption);

    for (const item of state.accessiblePaths) {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      searchBasePath.appendChild(option);
    }
  }

  function renderSearchStatus() {
    const quick = state.searchStatus?.quickBackend;
    const indexer = state.searchStatus?.quickIndexer;
    const live = state.searchStatus?.liveBackend;
    const index = state.searchStatus?.index;
    searchReindexButton.disabled = !indexer?.available || Boolean(index?.running);
    window.__fntreeSearchStatusUpdate?.(state.searchStatus);
  }

  function updateLimitFromSettings() {
    const fallback = state.mode === 'live' ? state.searchOptions.liveLimit : state.searchOptions.quickLimit;
    const current = Number(searchLimit.value);
    if (!Number.isFinite(current) || current < 10 || current > 200) {
      searchLimit.value = String(Number(fallback) || 50);
    }
  }

  async function runSearch() {
    const query = searchQuery.value.trim();
    if (!query) {
      throw new Error('请输入要搜索的关键词');
    }

    const limit = clampNumber(searchLimit.value, 10, 200, 50);
    searchLimit.value = String(limit);
    searchSubmitButton.loading = true;
    searchSummary.textContent = state.mode === 'live' ? '正在执行实时搜索' : '正在执行快速搜索';
    searchResultMeta.textContent = '搜索中';

    try {
      const response = await fetchJson('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: state.mode,
          query,
          basePath: searchBasePath.value,
          limit,
        }),
      });

      state.results = Array.isArray(response.items) ? response.items : [];
      state.selectedPath = state.results[0]?.path || '';
      renderResults();
      renderSelection(state.results[0] || null);
      searchResultMeta.textContent = `${shortCommandName(response.backend)} 返回 ${response.total} 项结果`;
      searchSummary.textContent =
        response.total > 0 ? `搜索完成，共 ${response.total} 项` : '没有找到符合条件的结果';
    } finally {
      searchSubmitButton.loading = false;
    }
  }

  async function refreshSearchStatus() {
    const status = await fetchJson('/api/search/status');
    state.searchStatus = status;
  }

  async function rebuildSearchIndex() {
    searchReindexButton.disabled = true;
      searchSummary.textContent = '正在发起 fd 索引重建';

    try {
      const response = await fetchJson('/api/search/reindex', { method: 'POST' });
      if (response?.searchStatus) {
        state.searchStatus = response.searchStatus;
        renderSearchStatus();
      }
      searchSummary.textContent = '索引重建已启动，正在轮询进度';
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
        searchSummary.textContent = '索引构建中，请稍候';
        continue;
      }

      if (index?.lastError) {
        searchSummary.textContent = `索引重建失败：${index.lastError}`;
        showError(`索引重建失败：${index.lastError}`);
        return;
      }

      if (index?.updatedAt) {
        searchSummary.textContent = `索引重建完成：${formatTime(index.updatedAt)}`;
        showMessage('索引重建完成');
        return;
      }

      searchSummary.textContent = '索引重建未产出数据库，请检查权限或路径';
      return;
    }

    searchSummary.textContent = '索引构建超时，请稍后刷新状态';
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
        return `
          <button class="search-result-item${selected}" type="button" data-path="${escapeHtml(item.path)}">
            <div class="search-result-main">
              <div class="search-result-name">${escapeHtml(item.name || item.path)}</div>
              <div class="search-result-meta">${item.type === 'directory' ? '目录' : '文件'} / ${escapeHtml(
                item.parent || '',
              )}</div>
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
        renderSelection(state.results.find((item) => item.path === state.selectedPath) || null);
      });
    });
  }

  function renderSelection(item) {
    if (!item) {
      searchSelection.className = 'selection-empty';
      searchSelection.textContent = '点击左侧结果查看详情';
      return;
    }

    searchSelection.className = 'search-selection';
    searchSelection.innerHTML = `
      <div class="selection-path">${escapeHtml(item.path)}</div>
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
