const themeRuntime = window.FNTreeTheme || {};
const THEME_PRESETS = themeRuntime.presets || {};
const applyTheme = (themeName, options) =>
  themeRuntime.applyTheme ? themeRuntime.applyTheme(themeName, options) : themeName;
const readCachedSettings = () =>
  themeRuntime.readSettingsSnapshot ? themeRuntime.readSettingsSnapshot() : null;
const writeCachedSettings = (settings) => {
  if (themeRuntime.writeSettingsSnapshot) {
    themeRuntime.writeSettingsSnapshot(settings);
  }
};

const settingTheme = document.getElementById('settingTheme');
const settingScanMode = document.getElementById('settingScanMode');
const settingsRailScan = document.getElementById('settingsRailScan');
const settingsRailSearch = document.getElementById('settingsRailSearch');
const settingsSectionScan = document.getElementById('settingsSectionScan');
const settingsSectionSearch = document.getElementById('settingsSectionSearch');
const settingsBackButton = document.getElementById('settingsBackButton');
const settingsCancelButton = document.getElementById('settingsCancelButton');
const settingsIntro = document.getElementById('settingsIntro');
const settingIgnoreHidden = document.getElementById('settingIgnoreHidden');
const settingNoCross = document.getElementById('settingNoCross');
const settingFollowSymlinks = document.getElementById('settingFollowSymlinks');
const settingConcurrent = document.getElementById('settingConcurrent');
const settingTopLimit = document.getElementById('settingTopLimit');
const topLimitDecrease = document.getElementById('topLimitDecrease');
const topLimitIncrease = document.getElementById('topLimitIncrease');
const settingTreemapVisible = document.getElementById('settingTreemapVisible');
const treemapVisibleDecrease = document.getElementById('treemapVisibleDecrease');
const treemapVisibleIncrease = document.getElementById('treemapVisibleIncrease');
const settingSearchIndexInterval = document.getElementById('settingSearchIndexInterval');
const searchIndexIntervalDecrease = document.getElementById('searchIndexIntervalDecrease');
const searchIndexIntervalIncrease = document.getElementById('searchIndexIntervalIncrease');
const searchIndexUpdatedAt = document.getElementById('searchIndexUpdatedAt');
const indexedPathsList = document.getElementById('indexedPathsList');
const saveSettingsButton = document.getElementById('saveSettingsButton');
const settingsStatus = document.getElementById('settingsStatus');

const settingsState = {
  section: 'scan',
  returnTarget: 'tree',
  theme: 'cinnamon',
  scanMode: 'disk-usage',
  topLimit: 30,
  treemapMaxVisible: 24,
  searchIndexIntervalHours: 24,
  accessiblePaths: [],
  indexedPaths: [],
};

bootstrap().catch((error) => {
  showError(error.message || '初始化设置页失败');
});

settingsRailScan?.addEventListener('click', () => {
  setActiveSection('scan', { updateUrl: true });
});

settingsRailSearch?.addEventListener('click', () => {
  setActiveSection('search', { updateUrl: true });
});

saveSettingsButton.addEventListener('click', () => {
  saveSettings().catch((error) => {
    showError(error.message || '保存设置失败');
  });
});

settingTheme.addEventListener('change', () => {
  settingsState.theme = settingTheme.value || 'cinnamon';
  renderThemeButtons();
  applyTheme(settingsState.theme, { persist: false });
});

settingScanMode.addEventListener('change', () => {
  settingsState.scanMode = settingScanMode.value || 'disk-usage';
  renderScanModeButtons();
});

topLimitDecrease.addEventListener('click', () => {
  settingsState.topLimit = Math.max(1, settingsState.topLimit - 1);
  renderTopLimit();
});

topLimitIncrease.addEventListener('click', () => {
  settingsState.topLimit = Math.min(999, settingsState.topLimit + 1);
  renderTopLimit();
});

settingTopLimit.addEventListener('input', () => {
  settingsState.topLimit = clampNumber(settingTopLimit.value, 1, 999, settingsState.topLimit);
});

treemapVisibleDecrease.addEventListener('click', () => {
  settingsState.treemapMaxVisible = Math.max(5, settingsState.treemapMaxVisible - 1);
  renderTreemapVisible();
});

treemapVisibleIncrease.addEventListener('click', () => {
  settingsState.treemapMaxVisible = Math.min(30, settingsState.treemapMaxVisible + 1);
  renderTreemapVisible();
});

settingTreemapVisible.addEventListener('input', () => {
  settingsState.treemapMaxVisible = clampNumber(
    settingTreemapVisible.value,
    5,
    30,
    settingsState.treemapMaxVisible,
  );
});

searchIndexIntervalDecrease.addEventListener('click', () => {
  settingsState.searchIndexIntervalHours = Math.max(1, settingsState.searchIndexIntervalHours - 1);
  renderSearchIndexInterval();
});

searchIndexIntervalIncrease.addEventListener('click', () => {
  settingsState.searchIndexIntervalHours = Math.min(168, settingsState.searchIndexIntervalHours + 1);
  renderSearchIndexInterval();
});

settingSearchIndexInterval.addEventListener('input', () => {
  settingsState.searchIndexIntervalHours = clampNumber(
    settingSearchIndexInterval.value,
    1,
    168,
    settingsState.searchIndexIntervalHours,
  );
});

async function bootstrap() {
  hydrateNavigationState();
  const cachedSettings = readCachedSettings();
  if (cachedSettings) {
    hydrateSettings(cachedSettings);
    settingsStatus.textContent = '已加载本地缓存设置';
  }

  const settings = await fetchJson('/api/settings');
  hydrateSettings(settings);
  await hydrateSearchIndexStatus();
  settingsStatus.textContent = '已加载当前默认设置';
}

function hydrateNavigationState() {
  const params = new URLSearchParams(window.location.search);
  const section = params.get('section');
  const returnTarget = params.get('return');

  settingsState.section = section === 'search' ? 'search' : 'scan';
  settingsState.returnTarget = returnTarget === 'search' ? 'search' : 'tree';

  setActiveSection(settingsState.section, { updateUrl: false });
  syncBackButtons();
}

function setActiveSection(section, options = {}) {
  settingsState.section = section === 'search' ? 'search' : 'scan';

  settingsSectionScan?.classList.toggle('is-active', settingsState.section === 'scan');
  settingsSectionSearch?.classList.toggle('is-active', settingsState.section === 'search');

  toggleRailItem(settingsRailScan, settingsState.section === 'scan');
  toggleRailItem(settingsRailSearch, settingsState.section === 'search');

  if (settingsIntro) {
    settingsIntro.textContent =
      settingsState.section === 'search'
        ? '集中调整搜索索引、快速搜索和实时搜索的默认行为。'
        : '集中调整扫描方式、Treemap 和分析默认行为。';
  }

  if (options.updateUrl !== false) {
    const params = new URLSearchParams(window.location.search);
    params.set('section', settingsState.section);
    params.set('return', settingsState.returnTarget);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  }
}

function toggleRailItem(item, active) {
  if (!item) {
    return;
  }
  item.toggleAttribute('active', active);
}

function syncBackButtons() {
  const href = settingsState.returnTarget === 'search' ? '/#search' : '/#tree';
  const label = settingsState.returnTarget === 'search' ? '返回搜索页' : '返回分析页';

  if (settingsBackButton) {
    settingsBackButton.href = href;
    settingsBackButton.textContent = label;
  }

  if (settingsCancelButton) {
    settingsCancelButton.href = href;
    settingsCancelButton.textContent = label;
  }
}

function hydrateSettings(settings) {
  const scanOptions = settings.scanOptions || {};
  settingsState.theme = settings.theme || 'cinnamon';
  settingsState.scanMode = scanOptions.scanMode || 'disk-usage';
  settingsState.topLimit = Number(scanOptions.topLimit || 30);
  settingsState.treemapMaxVisible = Number(scanOptions.treemapMaxVisible || 24);
  settingsState.searchIndexIntervalHours = Number(settings.searchOptions?.indexIntervalHours || 24);
  settingsState.accessiblePaths = Array.isArray(settings.accessiblePaths) ? settings.accessiblePaths.slice() : [];
  settingsState.indexedPaths = normalizeIndexedPaths(
    settings.searchOptions?.indexedPaths,
    settingsState.accessiblePaths,
  );
  settingIgnoreHidden.checked = Boolean(scanOptions.ignoreHidden);
  settingNoCross.checked = Boolean(scanOptions.noCross);
  settingFollowSymlinks.checked = Boolean(scanOptions.followSymlinks);
  settingConcurrent.checked = !Boolean(scanOptions.sequential);

  renderThemeButtons();
  renderScanModeButtons();
  renderTopLimit();
  renderTreemapVisible();
  renderSearchIndexInterval();
  renderIndexedPaths();
  applyTheme(settingsState.theme);
  writeCachedSettings(settings);
}

async function hydrateSearchIndexStatus() {
  if (!searchIndexUpdatedAt) {
    return;
  }

  try {
    const status = await fetchJson('/api/search/status');
    const index = status?.index;
    if (index?.running) {
      searchIndexUpdatedAt.textContent = '索引构建中';
      return;
    }
    if (index?.lastError) {
      searchIndexUpdatedAt.textContent = `最近失败：${index.lastError}`;
      return;
    }
    if (index?.updatedAt) {
      searchIndexUpdatedAt.textContent = `上次重建：${formatTime(index.updatedAt)}`;
      return;
    }
    searchIndexUpdatedAt.textContent = '尚未建立索引';
  } catch (_) {
    searchIndexUpdatedAt.textContent = '索引状态读取失败';
  }
}

function renderThemeButtons() {
  settingTheme.value = settingsState.theme;
}

function renderScanModeButtons() {
  settingScanMode.value = settingsState.scanMode;
}

function renderTopLimit() {
  settingTopLimit.value = String(settingsState.topLimit);
}

function renderTreemapVisible() {
  settingTreemapVisible.value = String(settingsState.treemapMaxVisible);
}

function renderSearchIndexInterval() {
  settingSearchIndexInterval.value = String(settingsState.searchIndexIntervalHours);
}

function renderIndexedPaths() {
  if (!indexedPathsList) {
    return;
  }

  if (!settingsState.accessiblePaths.length) {
    indexedPathsList.innerHTML = '<div class="list-empty">当前没有授权目录</div>';
    return;
  }

  indexedPathsList.innerHTML = settingsState.accessiblePaths
    .map((item) => {
      const checked = settingsState.indexedPaths.includes(item) ? ' checked' : '';
      return `
        <label class="indexed-path-item">
          <span class="indexed-path-copy">
            <strong>${escapeHtml(item)}</strong>
            <span>关闭后会在下次重建索引时移除该目录的索引数据。</span>
          </span>
          <mdui-switch class="indexed-path-toggle" data-path="${escapeHtml(item)}"${checked}></mdui-switch>
        </label>
      `;
    })
    .join('');

  indexedPathsList.querySelectorAll('.indexed-path-toggle').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const path = toggle.dataset.path || '';
      const checked = Boolean(toggle.checked);
      if (checked) {
        if (!settingsState.indexedPaths.includes(path)) {
          settingsState.indexedPaths.push(path);
        }
      } else {
        settingsState.indexedPaths = settingsState.indexedPaths.filter((item) => item !== path);
      }
    });
  });
}

function collectIndexedPathsFromToggles() {
  if (!indexedPathsList) {
    return normalizeIndexedPaths(settingsState.indexedPaths, settingsState.accessiblePaths);
  }

  const activePaths = Array.from(indexedPathsList.querySelectorAll('.indexed-path-toggle'))
    .filter((toggle) => Boolean(toggle.checked))
    .map((toggle) => toggle.dataset.path || '');

  return normalizeIndexedPaths(activePaths, settingsState.accessiblePaths);
}

async function saveSettings() {
  const topLimit = Number(settingsState.topLimit || 0);
  if (!Number.isInteger(topLimit) || topLimit <= 0) {
    throw new Error('前 N 项必须是正整数');
  }
  const treemapMaxVisible = Number(settingsState.treemapMaxVisible || 0);
  if (!Number.isInteger(treemapMaxVisible) || treemapMaxVisible < 5 || treemapMaxVisible > 30) {
    throw new Error('Treemap 最大显示块数必须在 5 到 30 之间');
  }

  const searchIndexIntervalHours = Number(settingsState.searchIndexIntervalHours || 0);
  if (!Number.isInteger(searchIndexIntervalHours) || searchIndexIntervalHours < 1 || searchIndexIntervalHours > 168) {
    throw new Error('搜索索引周期必须在 1 到 168 小时之间');
  }
  const indexedPaths = collectIndexedPathsFromToggles();
  if (!indexedPaths.length) {
    throw new Error('至少保留一个已启用索引的授权目录');
  }

  saveSettingsButton.disabled = true;
  settingsStatus.textContent = '正在保存';

  try {
    const settings = await fetchJson('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        theme: settingsState.theme || 'cinnamon',
        scanOptions: {
          scanMode: settingsState.scanMode || 'disk-usage',
          ignoreHidden: Boolean(settingIgnoreHidden.checked),
          noCross: Boolean(settingNoCross.checked),
          followSymlinks: Boolean(settingFollowSymlinks.checked),
          sequential: !Boolean(settingConcurrent.checked),
          topLimit,
          treemapMaxVisible,
        },
        searchOptions: {
          indexIntervalHours: searchIndexIntervalHours,
          indexedPaths,
        },
      }),
    });

    hydrateSettings(settings);
    settingsStatus.textContent = `设置已保存，当前主题：${THEME_PRESETS[settingsState.theme]?.label || '暖棕'}`;
    showMessage('设置已保存');
  } finally {
    saveSettingsButton.disabled = false;
  }
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
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

function normalizeIndexedPaths(value, accessiblePaths) {
  const allowed = new Set((Array.isArray(accessiblePaths) ? accessiblePaths : []).filter(Boolean));
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && allowed.has(item));
  }
  return Array.from(allowed);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `请求失败: ${response.status}`);
  }
  return data;
}

function showMessage(message) {
  if (window.mdui?.snackbar) {
    window.mdui.snackbar({ message });
    return;
  }
  window.alert(message);
}

function showError(message) {
  settingsStatus.textContent = message;
  showMessage(message);
}

