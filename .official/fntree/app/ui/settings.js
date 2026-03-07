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
const settingQuickLimit = document.getElementById('settingQuickLimit');
const quickLimitDecrease = document.getElementById('quickLimitDecrease');
const quickLimitIncrease = document.getElementById('quickLimitIncrease');
const settingLiveLimit = document.getElementById('settingLiveLimit');
const liveLimitDecrease = document.getElementById('liveLimitDecrease');
const liveLimitIncrease = document.getElementById('liveLimitIncrease');
const saveSettingsButton = document.getElementById('saveSettingsButton');
const settingsStatus = document.getElementById('settingsStatus');

const settingsState = {
  theme: 'cinnamon',
  scanMode: 'disk-usage',
  topLimit: 30,
  treemapMaxVisible: 24,
  searchIndexIntervalHours: 24,
  quickLimit: 50,
  liveLimit: 50,
};

bootstrap().catch((error) => {
  showError(error.message || '初始化设置页失败');
});

saveSettingsButton.addEventListener('click', () => {
  saveSettings().catch((error) => {
    showError(error.message || '保存设置失败');
  });
});

settingTheme.querySelectorAll('[data-value]').forEach((button) => {
  button.addEventListener('click', () => {
    settingsState.theme = button.dataset.value || 'cinnamon';
    renderThemeButtons();
    applyTheme(settingsState.theme, { persist: false });
  });
});

settingScanMode.querySelectorAll('[data-value]').forEach((button) => {
  button.addEventListener('click', () => {
    settingsState.scanMode = button.dataset.value || 'disk-usage';
    renderScanModeButtons();
  });
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

quickLimitDecrease.addEventListener('click', () => {
  settingsState.quickLimit = Math.max(10, settingsState.quickLimit - 10);
  renderQuickLimit();
});

quickLimitIncrease.addEventListener('click', () => {
  settingsState.quickLimit = Math.min(200, settingsState.quickLimit + 10);
  renderQuickLimit();
});

settingQuickLimit.addEventListener('input', () => {
  settingsState.quickLimit = clampNumber(settingQuickLimit.value, 10, 200, settingsState.quickLimit);
});

liveLimitDecrease.addEventListener('click', () => {
  settingsState.liveLimit = Math.max(10, settingsState.liveLimit - 10);
  renderLiveLimit();
});

liveLimitIncrease.addEventListener('click', () => {
  settingsState.liveLimit = Math.min(200, settingsState.liveLimit + 10);
  renderLiveLimit();
});

settingLiveLimit.addEventListener('input', () => {
  settingsState.liveLimit = clampNumber(settingLiveLimit.value, 10, 200, settingsState.liveLimit);
});

async function bootstrap() {
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

function hydrateSettings(settings) {
  const scanOptions = settings.scanOptions || {};
  settingsState.theme = settings.theme || 'cinnamon';
  settingsState.scanMode = scanOptions.scanMode || 'disk-usage';
  settingsState.topLimit = Number(scanOptions.topLimit || 30);
  settingsState.treemapMaxVisible = Number(scanOptions.treemapMaxVisible || 24);
  settingsState.searchIndexIntervalHours = Number(settings.searchOptions?.indexIntervalHours || 24);
  settingsState.quickLimit = Number(settings.searchOptions?.quickLimit || 50);
  settingsState.liveLimit = Number(settings.searchOptions?.liveLimit || 50);
  settingIgnoreHidden.checked = Boolean(scanOptions.ignoreHidden);
  settingNoCross.checked = Boolean(scanOptions.noCross);
  settingFollowSymlinks.checked = Boolean(scanOptions.followSymlinks);
  settingConcurrent.checked = !Boolean(scanOptions.sequential);

  renderThemeButtons();
  renderScanModeButtons();
  renderTopLimit();
  renderTreemapVisible();
  renderSearchIndexInterval();
  renderQuickLimit();
  renderLiveLimit();
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
  settingTheme.querySelectorAll('[data-value]').forEach((button) => {
    const selected = button.dataset.value === settingsState.theme;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function renderScanModeButtons() {
  settingScanMode.querySelectorAll('[data-value]').forEach((button) => {
    const selected = button.dataset.value === settingsState.scanMode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
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

function renderQuickLimit() {
  settingQuickLimit.value = String(settingsState.quickLimit);
}

function renderLiveLimit() {
  settingLiveLimit.value = String(settingsState.liveLimit);
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
  const quickLimit = Number(settingsState.quickLimit || 0);
  if (!Number.isInteger(quickLimit) || quickLimit < 10 || quickLimit > 200) {
    throw new Error('快速搜索结果上限必须在 10 到 200 之间');
  }
  const liveLimit = Number(settingsState.liveLimit || 0);
  if (!Number.isInteger(liveLimit) || liveLimit < 10 || liveLimit > 200) {
    throw new Error('实时搜索结果上限必须在 10 到 200 之间');
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
          quickLimit,
          liveLimit,
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

