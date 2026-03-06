'use strict';

const SETTINGS_CACHE_KEY = 'fntree.settings';
const THEME_PRESETS = {
  cinnamon: { label: '暖棕', accent: '#8d4f22', soft: '#f2d3b4' },
  slate: { label: '石墨', accent: '#55606f', soft: '#d7dde5' },
  forest: { label: '森林', accent: '#2f6f4f', soft: '#cde7da' },
  ocean: { label: '海蓝', accent: '#2b6e9a', soft: '#cfe5f4' },
};

const searchModeGroup = document.getElementById('searchModeGroup');
const searchBasePath = document.getElementById('searchBasePath');
const searchQuery = document.getElementById('searchQuery');
const searchLimit = document.getElementById('searchLimit');
const searchSubmitButton = document.getElementById('searchSubmitButton');
const searchResetButton = document.getElementById('searchResetButton');
const searchSummary = document.getElementById('searchSummary');
const searchBackendLabel = document.getElementById('searchBackendLabel');
const searchBackendMeta = document.getElementById('searchBackendMeta');
const searchResultMeta = document.getElementById('searchResultMeta');
const searchResultList = document.getElementById('searchResultList');
const searchSelection = document.getElementById('searchSelection');
const searchCopyPathButton = document.getElementById('searchCopyPathButton');
const searchOpenInFilesButton = document.getElementById('searchOpenInFilesButton');

const state = {
  theme: 'cinnamon',
  mode: 'quick',
  accessiblePaths: [],
  results: [],
  selectedPath: '',
  searchStatus: null,
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

searchOpenInFilesButton.addEventListener('click', () => {
  const item = state.results.find((entry) => entry.path === state.selectedPath);
  if (!item) {
    showError('当前没有可打开的搜索结果');
    return;
  }

  showError('暂未接入 FNOS 文件管理器打开接口。当前先保留路径复制能力。');
});

async function bootstrap() {
  const cachedSettings = readCachedSettings();
  if (cachedSettings) {
    applyTheme(cachedSettings.theme || 'cinnamon');
  }

  const settings = await fetchJson('/api/settings');
  state.theme = settings.theme || 'cinnamon';
  state.accessiblePaths = Array.isArray(settings.accessiblePaths) ? settings.accessiblePaths : [];
  state.searchStatus = settings.searchStatus || null;
  applyTheme(state.theme);
  writeCachedSettings(settings);

  renderModeButtons();
  renderAccessiblePaths();
  renderSearchStatus();
  updateLimitFromSettings(settings.searchOptions || {});
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
  const live = state.searchStatus?.liveBackend;
  const quickText = quick?.available ? `快速：${quick.command}` : '快速：未就绪';
  const liveText = live?.available ? `实时：${live.command}` : '实时：未就绪';
  searchBackendLabel.textContent = quick?.available || live?.available ? '搜索可用' : '搜索受限';
  searchBackendMeta.textContent = `${quickText} / ${liveText}`;
}

function updateLimitFromSettings(searchOptions = {}) {
  const fallback = state.mode === 'live' ? searchOptions.liveLimit : searchOptions.quickLimit;
  const parsed = Number(fallback);
  const current = Number(searchLimit.value);
  if (!Number.isFinite(current) || current < 10 || current > 200) {
    searchLimit.value = String(Number.isFinite(parsed) ? parsed : 50);
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
    searchResultMeta.textContent = `${response.backend} 返回 ${response.total} 项结果`;
    searchSummary.textContent =
      response.total > 0 ? `搜索完成：${response.total} 项` : '没有找到符合条件的结果';
  } finally {
    searchSubmitButton.loading = false;
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

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
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

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => char + char)
        .join('')
    : normalized;

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function withAlpha(color, alpha) {
  const { r, g, b } = hexToRgb(color.startsWith('#') ? color : rgbToHex(color));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(colorA, colorB, weight) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const ratio = Math.max(0, Math.min(1, weight));
  return rgbToHex({
    r: Math.round(a.r + (b.r - a.r) * ratio),
    g: Math.round(a.g + (b.g - a.g) * ratio),
    b: Math.round(a.b + (b.b - a.b) * ratio),
  });
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')}`;
}
