(() => {
  'use strict';

  const searchModeGroup = document.getElementById('searchModeGroup');
  const searchBasePathTrigger = document.getElementById('searchBasePathTrigger');
  const searchBasePathLabel = document.getElementById('searchBasePathLabel');
  const searchBasePathMenu = document.getElementById('searchBasePathMenu');
  const searchQuery = document.getElementById('searchQuery');
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
    !searchBasePathTrigger ||
    !searchBasePathLabel ||
    !searchBasePathMenu ||
    !searchQuery ||
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
    basePath: '',
    basePathMenuOpen: false,
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
    });
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
    state.results = [];
    state.selectedPath = '';
    renderResults();
    renderSelection(null);
    searchResultMeta.textContent = '已清空结果';
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
    searchSummary.hidden = true;
  }

  function renderModeButtons() {
    searchModeGroup.querySelectorAll('[data-mode]').forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  function renderAccessiblePaths() {
    state.basePath = '';
    searchBasePathMenu.innerHTML = '';
    updateBasePathTrigger('全部已授权目录');
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

    const limit = clampNumber(
      state.mode === 'live' ? state.searchOptions.liveLimit : state.searchOptions.quickLimit,
      10,
      200,
      50,
    );
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
          limit,
        }),
      });

      state.results = Array.isArray(response.items) ? response.items : [];
      state.selectedPath = state.results[0]?.path || '';
      renderResults();
      renderSelection(state.results[0] || null);
      searchResultMeta.textContent = `${shortCommandName(response.backend)} 返回 ${response.total} 项结果`;
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
