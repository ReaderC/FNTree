const SETTINGS_CACHE_KEY = 'fntree.settings';
const THEME_PRESETS = {
  cinnamon: { label: '暖棕', accent: '#8d4f22', soft: '#f2d3b4' },
  slate: { label: '石墨', accent: '#55606f', soft: '#d7dde5' },
  forest: { label: '森林', accent: '#2f6f4f', soft: '#cde7da' },
  ocean: { label: '海蓝', accent: '#2b6e9a', soft: '#cfe5f4' },
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
const saveSettingsButton = document.getElementById('saveSettingsButton');
const settingsStatus = document.getElementById('settingsStatus');

const settingsState = {
  theme: 'cinnamon',
  scanMode: 'disk-usage',
  topLimit: 30,
  treemapMaxVisible: 24,
  searchIndexIntervalHours: 24,
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
    applyTheme(settingsState.theme);
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
  settingIgnoreHidden.checked = Boolean(scanOptions.ignoreHidden);
  settingNoCross.checked = Boolean(scanOptions.noCross);
  settingFollowSymlinks.checked = Boolean(scanOptions.followSymlinks);
  settingConcurrent.checked = !Boolean(scanOptions.sequential);

  renderThemeButtons();
  renderScanModeButtons();
  renderTopLimit();
  renderTreemapVisible();
  renderSearchIndexInterval();
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

function applyTheme(themeName) {
  const preset = THEME_PRESETS[themeName] || THEME_PRESETS.cinnamon;
  const root = document.documentElement;
  const accentRgb = hexToRgb(preset.accent);
  const panelMix = mix('#fffaf4', preset.soft, 0.34);
  const panelStrong = mix('#ffffff', preset.soft, 0.18);
  root.style.setProperty('--accent', preset.accent);
  root.style.setProperty('--accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
  root.style.setProperty('--accent-soft', preset.soft);
  root.style.setProperty('--panel-bg', withAlpha(panelMix, 0.88));
  root.style.setProperty('--panel-border', withAlpha(preset.accent, 0.12));
  root.style.setProperty('--shadow', `0 18px 60px ${withAlpha(preset.accent, 0.12)}`);
  root.style.setProperty('--accent-faint', withAlpha(preset.accent, 0.03));
  root.style.setProperty('--accent-soft-bg', withAlpha(preset.accent, 0.08));
  root.style.setProperty('--accent-soft-bg-strong', withAlpha(preset.accent, 0.1));
  root.style.setProperty('--accent-soft-bg-muted', withAlpha(preset.accent, 0.05));
  root.style.setProperty('--accent-selected-start', withAlpha(preset.accent, 0.92));
  root.style.setProperty('--accent-selected-end', withAlpha(mix('#000000', preset.accent, 0.76), 0.92));
  root.style.setProperty('--accent-outline', withAlpha(preset.accent, 0.18));
  root.style.setProperty('--accent-border-strong', withAlpha(preset.accent, 0.42));
  root.style.setProperty('--card-glow', withAlpha(preset.accent, 0.22));
  root.style.setProperty('--scrollbar-track', withAlpha(preset.accent, 0.08));
  root.style.setProperty('--scrollbar-thumb-start', withAlpha(preset.accent, 0.72));
  root.style.setProperty('--scrollbar-thumb-end', withAlpha(mix('#000000', preset.accent, 0.62), 0.72));
  root.style.setProperty('--treemap-surface-start', withAlpha(panelStrong, 0.84));
  root.style.setProperty('--treemap-surface-mid', withAlpha(mix('#fff4e3', preset.soft, 0.44), 0.68));
  root.style.setProperty('--treemap-surface-end', withAlpha(panelMix, 0.96));
  root.style.setProperty('--switch-off-bg', withAlpha(preset.accent, 0.2));
  root.style.setProperty('--switch-on-bg', withAlpha(preset.accent, 0.72));
  root.style.setProperty(
    '--page-bg',
    `linear-gradient(180deg, ${mix('#ffffff', preset.soft, 0.28)} 0%, ${mix(
      '#f4ecdf',
      preset.soft,
      0.42,
    )} 46%, ${mix('#e5dbc5', preset.soft, 0.24)} 100%)`,
  );

  if (window.mdui?.setColorScheme) {
    window.mdui.setColorScheme(preset.accent);
  }
}

function readCachedSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed?.value || null;
  } catch {
    return null;
  }
}

function writeCachedSettings(settings) {
  try {
    window.localStorage.setItem(
      SETTINGS_CACHE_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        value: settings,
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
