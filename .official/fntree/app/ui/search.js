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
  const searchResultBreadcrumb = document.getElementById('searchResultBreadcrumb');
  const searchResultList = document.getElementById('searchResultList');
  const searchTypeFilterGroup = document.getElementById('searchTypeFilterGroup');
  const searchSortTrigger = document.getElementById('searchSortTrigger');
  const searchSortTriggerLabel = document.getElementById('searchSortTriggerLabel');
  const searchSortDirectionTrigger = document.getElementById('searchSortDirectionTrigger');
  const searchSortDirectionLabel = document.getElementById('searchSortDirectionLabel');
  const searchSortMenu = document.getElementById('searchSortMenu');
  const searchSortDirectionMenu = document.getElementById('searchSortDirectionMenu');
  const searchSelection = document.getElementById('searchSelection');
  const searchCopyPathButton = document.getElementById('searchCopyPathButton');
  const searchReindexButton =
    document.getElementById('searchReindexButton') || { disabled: false, addEventListener() {} };
  const searchSortItems = Array.from(
    document.querySelectorAll('#searchSortMenu mdui-menu-item'),
  );
  const searchDirectionItems = Array.from(
    document.querySelectorAll('#searchSortDirectionMenu mdui-menu-item'),
  );
  const searchScopeSuggestMenu = document.createElement('mdui-menu');
  const searchSortMenuAnchors = new Map([
    [searchSortMenu, searchSortTrigger],
    [searchSortDirectionMenu, searchSortDirectionTrigger],
  ]);
  let searchScopeSuggestRequestId = 0;

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
    !searchResultBreadcrumb ||
    !searchResultList ||
    !searchTypeFilterGroup ||
    !searchSortTrigger ||
    !searchSortTriggerLabel ||
    !searchSortDirectionTrigger ||
    !searchSortDirectionLabel ||
    !searchSortMenu ||
    !searchSortDirectionMenu ||
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
    colorScheme: 'auto',
    mode: 'quick',
    accessiblePaths: [],
    basePath: '',
    basePathMenuOpen: false,
    rawResults: [],
    results: [],
    selectedPath: '',
    selectedItem: null,
    resultFilter: 'all',
    resultSort: 'relevance',
    resultDirection: 'desc',
    resultViewItems: [],
    resultViewStack: [],
    searchStatus: null,
    searchOptions: {
      quickLimit: 0,
      liveLimit: 0,
    },
    scopeSuggestOpen: false,
  };

  setupSearchScopeSuggestMenu();
  setupSearchBasePathMenu();
  setupSearchSortMenus();

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
    closeSearchScopeSuggestMenu();
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
    closeSearchScopeSuggestMenu();
    runSearch().catch((error) => {
      showError(error.message || '搜索失败');
    });
  });

  searchResetButton.addEventListener('click', () => {
    searchQuery.value = '';
    closeSearchScopeSuggestMenu();
    state.rawResults = [];
    state.results = [];
    state.selectedPath = '';
    state.selectedItem = null;
    state.resultViewItems = [];
    state.resultViewStack = [];
    renderResults();
    renderResultBreadcrumb();
    void renderSelection(null);
    searchResultMeta.textContent = '已清空结果';
  });

  searchTypeFilterGroup.addEventListener('change', () => {
    state.resultFilter = normalizeResultFilter(searchTypeFilterGroup.value);
    applyResultView();
  });

  searchSortItems.forEach((item) => {
    item.addEventListener('click', () => {
      state.resultSort = normalizeResultSort(item.value);
      applyResultView();
      updateSortTriggerLabels();
      closeSearchSortDropdowns();
    });
  });

  searchDirectionItems.forEach((item) => {
    item.addEventListener('click', () => {
      state.resultDirection = normalizeSortDirection(item.value);
      applyResultView();
      updateSortTriggerLabels();
      closeSearchSortDropdowns();
    });
  });

  searchSortTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = searchSortMenu.hasAttribute('hidden');
    closeSearchSortDropdowns();
    if (shouldOpen) {
      openSearchSortMenu(searchSortMenu);
    }
  });

  searchSortDirectionTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = searchSortDirectionMenu.hasAttribute('hidden');
    closeSearchSortDropdowns();
    if (shouldOpen) {
      openSearchSortMenu(searchSortDirectionMenu);
    }
  });

  function syncSearchSortMenus() {
    searchSortItems.forEach((item) => {
      item.toggleAttribute('selected', item.value === state.resultSort);
    });
    searchDirectionItems.forEach((item) => {
      item.toggleAttribute('selected', item.value === state.resultDirection);
    });
  }

  function setupSearchSortMenus() {
    [searchSortMenu, searchSortDirectionMenu].forEach((menu) => {
      document.body.append(menu);
      menu.setAttribute('hidden', '');
    });
    updateSearchSortTriggerState();
  }

  function setupSearchScopeSuggestMenu() {
    searchScopeSuggestMenu.className = 'path-picker-menu search-scope-suggest-menu';
    searchScopeSuggestMenu.setAttribute('hidden', '');
    document.body.append(searchScopeSuggestMenu);
  }

  function setupSearchBasePathMenu() {
    document.body.append(searchBasePathMenu);
    searchBasePathMenu.setAttribute('hidden', '');
    updateBasePathTriggerState();
  }

  function positionFloatingMenu(menu, trigger, minimumWidth = 0) {
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const gutter = 12;
    const gap = 6;
    const triggerWidth = Math.ceil(triggerRect.width);

    menu.style.visibility = 'hidden';
    menu.removeAttribute('hidden');

    const measuredWidth = Math.ceil(menu.offsetWidth);
    const menuWidth = Math.max(minimumWidth, triggerWidth, measuredWidth);
    const maxLeft = Math.max(gutter, viewportWidth - menuWidth - gutter);
    const left = Math.min(Math.max(gutter, Math.round(triggerRect.left)), maxLeft);

    menu.style.left = `${left}px`;
    menu.style.top = `${Math.round(triggerRect.bottom + gap)}px`;
    menu.style.minWidth = `${Math.max(minimumWidth, triggerWidth)}px`;
    menu.style.maxWidth = `${Math.max(minimumWidth, triggerWidth)}px`;
    menu.style.visibility = '';
  }

  function closeSearchScopeSuggestMenu() {
    state.scopeSuggestOpen = false;
    searchScopeSuggestMenu.setAttribute('hidden', '');
  }

  function openSearchScopeSuggestMenu() {
    state.scopeSuggestOpen = true;
    positionFloatingMenu(searchScopeSuggestMenu, searchQuery, 360);
  }

  function normalizeScopePath(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }

  function joinScopePath(basePath, relativePath) {
    const normalizedBase = normalizeScopePath(basePath);
    const normalizedRelative = String(relativePath || '').replace(/^\/+|\/+$/g, '');
    if (!normalizedRelative) {
      return normalizedBase;
    }
    return `${normalizedBase}/${normalizedRelative}`;
  }

  function getSearchScopeDraft() {
    const rawValue = searchQuery.value.trim();
    if (!rawValue || /\s/.test(rawValue)) {
      return null;
    }
    if (rawValue.startsWith('@')) {
      return { mode: '@', token: rawValue.slice(1) };
    }
    if (rawValue.startsWith('/')) {
      return { mode: '/', token: rawValue };
    }
    return null;
  }

  function splitScopeToken(value) {
    const normalized = String(value || '').replace(/\\/g, '/');
    const hasTrailingSlash = normalized.endsWith('/');
    const trimmed = normalized.replace(/\/+$/g, '');
    if (!trimmed) {
      return { parent: '', partial: '', hasTrailingSlash };
    }

    const lastSlashIndex = trimmed.lastIndexOf('/');
    if (hasTrailingSlash) {
      return { parent: trimmed, partial: '', hasTrailingSlash };
    }
    if (lastSlashIndex === -1) {
      return { parent: '', partial: trimmed, hasTrailingSlash };
    }
    return {
      parent: trimmed.slice(0, lastSlashIndex),
      partial: trimmed.slice(lastSlashIndex + 1),
      hasTrailingSlash,
    };
  }

  async function fetchDirectorySuggestions(pathValue, partial = '') {
    const response = await fetchJson(`/api/search/children?path=${encodeURIComponent(pathValue)}`);
    const partialLower = String(partial || '').toLowerCase();
    return (Array.isArray(response.items) ? response.items : [])
      .filter((item) => item?.type === 'directory')
      .filter((item) =>
        !partialLower || String(item.name || '').toLowerCase().includes(partialLower),
      );
  }

  async function updateSearchScopeSuggestions() {
    const draft = getSearchScopeDraft();
    const requestId = ++searchScopeSuggestRequestId;

    if (!draft) {
      closeSearchScopeSuggestMenu();
      return;
    }

    let suggestions = [];

    try {
      if (draft.mode === '@') {
        if (!state.basePath) {
          closeSearchScopeSuggestMenu();
          return;
        }

        const relative = splitScopeToken(draft.token);
        const parentPath = joinScopePath(state.basePath, relative.parent);
        const prefix = `@${relative.parent ? `${relative.parent}/` : ''}`;
        const items = await fetchDirectorySuggestions(parentPath, relative.partial);
        suggestions = items.map((item) => ({
          label: item.path,
          insertValue: `${prefix}${item.name}/`,
        }));
      } else {
        const absoluteDraft = draft.token.replace(/\\/g, '/');
        const normalizedAccessible = state.accessiblePaths.map((item) => normalizeScopePath(item));
        const matchedBase = normalizedAccessible
          .filter(
            (item) => absoluteDraft === item || absoluteDraft.startsWith(`${item}/`),
          )
          .sort((a, b) => b.length - a.length)[0];

        if (!matchedBase) {
          suggestions = normalizedAccessible
            .filter((item) => item.startsWith(absoluteDraft))
            .map((item) => ({
              label: item,
              insertValue: `${item}/`,
            }));
        } else {
          const relativeDraft = absoluteDraft.slice(matchedBase.length).replace(/^\/+/, '');
          const split = splitScopeToken(relativeDraft);
          const parentPath = joinScopePath(matchedBase, split.parent);
          const prefix = `${normalizeScopePath(parentPath)}/`;
          const items = await fetchDirectorySuggestions(parentPath, split.partial);
          suggestions = items.map((item) => ({
            label: item.path,
            insertValue: `${prefix}${item.name}/`,
          }));
        }
      }
    } catch {
      closeSearchScopeSuggestMenu();
      return;
    }

    if (requestId !== searchScopeSuggestRequestId) {
      return;
    }

    if (!suggestions.length) {
      closeSearchScopeSuggestMenu();
      return;
    }

    renderSearchScopeSuggestions(suggestions);
    openSearchScopeSuggestMenu();
  }

  function renderSearchScopeSuggestions(items) {
    searchScopeSuggestMenu.innerHTML = '';
    items.forEach((item) => {
      const menuItem = document.createElement('mdui-menu-item');
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', () => {
        searchQuery.value = item.insertValue;
        searchQuery.focus();
        void updateSearchScopeSuggestions();
      });
      searchScopeSuggestMenu.append(menuItem);
    });
  }

  function positionSearchSortMenu(menu) {
    const trigger = searchSortMenuAnchors.get(menu);
    positionFloatingMenu(menu, trigger);
  }

  function openSearchSortMenu(menu) {
    syncSearchSortMenus();
    positionSearchSortMenu(menu);
    updateSearchSortTriggerState();
  }

  function closeSearchSortDropdowns() {
    searchSortMenu.setAttribute('hidden', '');
    searchSortDirectionMenu.setAttribute('hidden', '');
    updateSearchSortTriggerState();
  }

  function updateSearchSortTriggerState() {
    searchSortTrigger.setAttribute(
      'aria-expanded',
      searchSortMenu.hasAttribute('hidden') ? 'false' : 'true',
    );
    searchSortDirectionTrigger.setAttribute(
      'aria-expanded',
      searchSortDirectionMenu.hasAttribute('hidden') ? 'false' : 'true',
    );
  }

  function sortLabel(value) {
    if (value === 'size') return '按大小';
    if (value === 'mtime') return '按时间';
    if (value === 'name') return '按名称';
    return '按匹配顺序';
  }

  function directionLabel(value) {
    return value === 'asc' ? '升序' : '降序';
  }

  function updateSortTriggerLabels() {
    searchSortTriggerLabel.textContent = sortLabel(state.resultSort);
    searchSortDirectionLabel.textContent = directionLabel(state.resultDirection);
    syncSearchSortMenus();
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (
      target instanceof Node &&
      (searchSortTrigger.contains(target) ||
        searchSortDirectionTrigger.contains(target) ||
        searchSortMenu.contains(target) ||
        searchSortDirectionMenu.contains(target))
    ) {
      return;
    }
    closeSearchSortDropdowns();
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (
      target instanceof Node &&
      (searchQuery.contains(target) || searchScopeSuggestMenu.contains(target))
    ) {
      return;
    }
    closeSearchScopeSuggestMenu();
  });

  window.addEventListener(
    'scroll',
    () => {
      setBasePathMenuOpen(false);
      closeSearchSortDropdowns();
      closeSearchScopeSuggestMenu();
    },
    true,
  );

  document.addEventListener(
    'wheel',
    () => {
      setBasePathMenuOpen(false);
      closeSearchSortDropdowns();
      closeSearchScopeSuggestMenu();
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'touchmove',
    () => {
      setBasePathMenuOpen(false);
      closeSearchSortDropdowns();
      closeSearchScopeSuggestMenu();
    },
    { capture: true, passive: true },
  );

  window.addEventListener('resize', () => {
    setBasePathMenuOpen(false);
    closeSearchSortDropdowns();
    closeSearchScopeSuggestMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setBasePathMenuOpen(false);
      closeSearchSortDropdowns();
      closeSearchScopeSuggestMenu();
    }
  });

  searchQuery.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      closeSearchScopeSuggestMenu();
      runSearch().catch((error) => {
        showError(error.message || '搜索失败');
      });
    }
  });

  searchQuery.addEventListener('input', () => {
    void updateSearchScopeSuggestions();
  });

  searchQuery.addEventListener('focus', () => {
    void updateSearchScopeSuggestions();
  });

  searchCopyPathButton.addEventListener('click', async () => {
    const item = state.selectedItem;
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
      applyTheme(cachedSettings.theme || 'cinnamon', {
        colorScheme: cachedSettings.colorScheme || 'auto',
      });
    }

    const settings = await fetchJson('/api/settings');
    state.theme = settings.theme || 'cinnamon';
    state.colorScheme = settings.colorScheme || 'auto';
    state.accessiblePaths = Array.isArray(settings.accessiblePaths) ? settings.accessiblePaths : [];
    state.searchStatus = settings.searchStatus || null;
    state.searchOptions = {
      ...state.searchOptions,
      ...(settings.searchOptions || {}),
    };
    applyTheme(state.theme, { colorScheme: state.colorScheme });
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
    closeSearchScopeSuggestMenu();
    searchBasePathMenu.innerHTML = '';
    updateBasePathTrigger('全部已授权目录');
    renderCurrentScope();
    renderBasePathMenu();
  }

  function renderBasePathMenu() {
    searchBasePathMenu.innerHTML = '';

    const createOption = (label, value) => {
      const option = document.createElement('mdui-menu-item');
      option.textContent = label;
      option.dataset.path = value;
      option.value = value;
      option.toggleAttribute('selected', value === state.basePath);
      option.addEventListener('click', () => {
        state.basePath = value;
        closeSearchScopeSuggestMenu();
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
    if (open) {
      positionFloatingMenu(searchBasePathMenu, searchBasePathTrigger, 280);
    } else {
      searchBasePathMenu.setAttribute('hidden', '');
    }
    searchBasePathTrigger.classList.toggle('is-open', open);
    updateBasePathTriggerState();
  }

  function updateBasePathTrigger(label) {
    searchBasePathLabel.textContent = label;
    searchBasePathTrigger.setAttribute('title', label);
    searchBasePathTrigger.setAttribute('aria-label', label);
  }

  function updateBasePathTriggerState() {
    searchBasePathTrigger.setAttribute('aria-expanded', state.basePathMenuOpen ? 'true' : 'false');
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
        scopeLabel: response.basePath || '全部已授权目录',
      });
    } finally {
      searchSubmitButton.loading = false;
    }
  }

  function renderResultControls() {
    searchTypeFilterGroup.value = state.resultFilter;
    updateSortTriggerLabels();
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
    renderResultControls();
    resetResultNavigation();

    if (context) {
      const total = context.total ?? state.rawResults.length;
      const filteredLabel =
        filtered.length === total ? `${total} 项结果` : `${total} 项结果，当前显示 ${filtered.length} 项`;
      const scopePrefix = context.scopeLabel ? `${context.scopeLabel} · ` : '';
      searchResultMeta.textContent = `${scopePrefix}${context.backend || '搜索'} 返回 ${filteredLabel}`;
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
    if (!state.resultViewItems.length) {
      searchResultList.className = 'search-result-list list-empty';
      searchResultList.textContent = state.resultViewStack.length ? '当前目录为空' : '没有搜索结果';
      return;
    }

    searchResultList.className = 'search-result-list';
    searchResultList.innerHTML = state.resultViewItems
      .map((item) => {
        const selected = item.path === state.selectedPath ? ' is-selected' : '';
        const name = item.name || item.path;
        const parentText = item.parent || '-';
        const secondaryMeta =
          item.type === 'directory'
            ? `${formatCount(item)} / ${formatTime(item.mtime)}`
            : `${typeText(item.type)} / ${formatTime(item.mtime)}`;
        return `
          <button class="list-row interactive-row search-result-row${selected}" type="button" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
            <div class="list-main">
              <div class="list-path" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
              <div class="list-size">${formatBytes(item.size || 0)}</div>
            </div>
            <div class="list-meta" title="${escapeHtml(parentText)}">${typeText(item.type)} / ${escapeHtml(parentText)}</div>
            <div class="list-submeta">${escapeHtml(secondaryMeta)}</div>
          </button>
        `;
      })
      .join('');

    searchResultList.querySelectorAll('[data-path]').forEach((button) => {
      button.addEventListener('click', async () => {
        const nextPath = button.dataset.path || '';
        const nextItem = state.resultViewItems.find((item) => item.path === nextPath);
        if (!nextItem) {
          return;
        }
        if (nextItem.type === 'directory') {
          await openResultDirectory(nextItem);
          return;
        }
        state.selectedPath = nextPath;
        state.selectedItem = nextItem;
        renderResults();
        await renderSelection(nextItem);
      });
    });
  }

  async function renderSelection(item) {
    state.selectedItem = item || null;
    if (!item) {
      searchSelection.className = 'selection-empty';
      searchSelection.textContent = '点击左侧结果查看详情';
      return;
    }

    searchSelection.className = 'search-selection';
    searchSelection.innerHTML = `
      <div class="selection-path" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
      <div class="detail-grid">
        <div class="detail-row">
          <span>类型</span>
          <strong title="${item.type === 'directory' ? '目录' : '文件'}">${item.type === 'directory' ? '目录' : '文件'}</strong>
        </div>
        <div class="detail-row">
          <span>大小</span>
          <strong title="${formatBytes(item.size || 0)}">${formatBytes(item.size || 0)}</strong>
        </div>
        <div class="detail-row">
          <span>上级目录</span>
          <strong title="${escapeHtml(item.parent || '-')}">${escapeHtml(item.parent || '-')}</strong>
        </div>
        <div class="detail-row">
          <span>修改时间</span>
          <strong title="${formatTime(item.mtime)}">${formatTime(item.mtime)}</strong>
        </div>
      </div>
    `;
  }

  function resetResultNavigation() {
    state.resultViewStack = [];
    state.resultViewItems = state.results.slice();
    if (!state.resultViewItems.some((item) => item.path === state.selectedPath)) {
      state.selectedPath = state.resultViewItems[0]?.path || '';
    }
    state.selectedItem =
      state.resultViewItems.find((item) => item.path === state.selectedPath) || null;
    renderResultBreadcrumb();
    renderResults();
    void renderSelection(state.selectedItem);
  }

  function renderResultBreadcrumb() {
    const crumbs = [{ label: '搜索结果', level: -1 }];
    state.resultViewStack.forEach((entry, index) => {
      crumbs.push({ label: entry.label, level: index });
    });

    if (crumbs.length <= 1) {
      searchResultBreadcrumb.hidden = true;
      searchResultBreadcrumb.innerHTML = '';
      return;
    }

    searchResultBreadcrumb.hidden = false;
    searchResultBreadcrumb.innerHTML = crumbs
      .map(
        (crumb, index) => `
          ${index > 0 ? '<span class="search-breadcrumb-separator">/</span>' : ''}
          <button class="search-breadcrumb-button${index === crumbs.length - 1 ? ' is-current' : ''}" type="button" data-level="${crumb.level}">
            ${escapeHtml(crumb.label)}
          </button>
        `,
      )
      .join('');

    searchResultBreadcrumb.querySelectorAll('[data-level]').forEach((button) => {
      button.addEventListener('click', () => {
        const level = Number(button.dataset.level);
        navigateToBreadcrumb(level);
      });
    });
  }

  function navigateToBreadcrumb(level) {
    if (level < 0) {
      state.resultViewStack = [];
      state.resultViewItems = state.results.slice();
      state.selectedPath = '';
      renderResultBreadcrumb();
      renderResults();
      void renderSelection(null);
      return;
    }

    const target = state.resultViewStack[level];
    if (!target) {
      return;
    }

    state.resultViewStack = state.resultViewStack.slice(0, level + 1);
    state.resultViewItems = target.items.slice();
    state.selectedPath = '';
    state.selectedItem = target.item || null;
    renderResultBreadcrumb();
    renderResults();
    void renderSelection(target.item || null);
  }

  async function openResultDirectory(item) {
    const response = await fetchJson(`/api/search/children?path=${encodeURIComponent(item.path)}`);
    const children = Array.isArray(response.items) ? response.items : [];
    state.resultViewStack.push({
      label: item.name || item.path,
      path: item.path,
      items: children,
      item,
    });
    state.resultViewItems = children;
    state.selectedPath = '';
    state.selectedItem = item;
    renderResultBreadcrumb();
    renderResults();
    await renderSelection(item);
  }

  function typeText(type) {
    return type === 'directory' ? '目录' : '文件';
  }

  function formatCount(item) {
    if (item.type !== 'directory') {
      return '1 项';
    }
    return `${Number(item.childCount || 0)} 项`;
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
