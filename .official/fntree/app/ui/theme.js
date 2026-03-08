(function () {
  'use strict';

  const THEME_CACHE_KEY = 'fntree.theme';
  const COLOR_SCHEME_CACHE_KEY = 'fntree.color-scheme';
  const SETTINGS_SNAPSHOT_KEY = 'fntree.settings';
  const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

  const THEME_PRESETS = {
    cinnamon: { label: '暖棕', accent: '#8d4f22', soft: '#f2d3b4' },
    slate: { label: '石墨', accent: '#55606f', soft: '#d7dde5' },
    forest: { label: '森林', accent: '#2f6f4f', soft: '#cde7da' },
    ocean: { label: '海蓝', accent: '#2b6e9a', soft: '#cfe5f4' },
  };

  function readJsonCache(key) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed.value ?? null : null;
    } catch {
      return null;
    }
  }

  function writeJsonCache(key, value) {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          updatedAt: Date.now(),
          value,
        }),
      );
    } catch {
      // Ignore storage failures.
    }
  }

  function readSettingsSnapshot() {
    return readJsonCache(SETTINGS_SNAPSHOT_KEY);
  }

  function writeSettingsSnapshot(settings) {
    if (!settings || typeof settings !== 'object') {
      return;
    }
    writeJsonCache(SETTINGS_SNAPSHOT_KEY, settings);
  }

  function readThemeName() {
    const cachedTheme = readJsonCache(THEME_CACHE_KEY);
    if (cachedTheme && THEME_PRESETS[cachedTheme]) {
      return cachedTheme;
    }

    const cachedSettings = readSettingsSnapshot();
    if (cachedSettings?.theme && THEME_PRESETS[cachedSettings.theme]) {
      return cachedSettings.theme;
    }

    return 'cinnamon';
  }

  function normalizeColorScheme(value) {
    return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
  }

  function readColorScheme() {
    const cachedScheme = normalizeColorScheme(readJsonCache(COLOR_SCHEME_CACHE_KEY));
    if (cachedScheme !== 'auto' || readJsonCache(COLOR_SCHEME_CACHE_KEY) === 'auto') {
      return cachedScheme;
    }

    const cachedSettings = readSettingsSnapshot();
    return normalizeColorScheme(cachedSettings?.colorScheme);
  }

  function writeThemeName(themeName) {
    const normalized = THEME_PRESETS[themeName] ? themeName : 'cinnamon';
    writeJsonCache(THEME_CACHE_KEY, normalized);
  }

  function writeColorScheme(colorScheme) {
    writeJsonCache(COLOR_SCHEME_CACHE_KEY, normalizeColorScheme(colorScheme));
  }

  function resolveColorScheme(colorScheme) {
    const normalized = normalizeColorScheme(colorScheme);
    if (normalized !== 'auto') {
      return normalized;
    }

    try {
      return window.matchMedia?.(DARK_MEDIA_QUERY)?.matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function applyTheme(themeName, options = {}) {
    const normalized = THEME_PRESETS[themeName] ? themeName : 'cinnamon';
    const preset = THEME_PRESETS[normalized];
    const colorScheme = normalizeColorScheme(options.colorScheme ?? readColorScheme());
    const resolvedColorScheme = resolveColorScheme(colorScheme);
    const root = document.documentElement;
    const accentRgb = hexToRgb(preset.accent);
    const isDark = resolvedColorScheme === 'dark';
    const panelMix = isDark ? mix('#14171c', preset.soft, 0.12) : mix('#fffaf4', preset.soft, 0.34);
    const panelStrong = isDark ? mix('#191d23', preset.soft, 0.08) : mix('#ffffff', preset.soft, 0.18);
    const pageStart = isDark ? mix('#0b0e12', preset.soft, 0.05) : mix('#ffffff', preset.soft, 0.28);
    const pageMid = isDark ? mix('#12161c', preset.soft, 0.08) : mix('#f4ecdf', preset.soft, 0.42);
    const pageEnd = isDark ? mix('#181d24', preset.soft, 0.12) : mix('#e5dbc5', preset.soft, 0.24);
    const textMain = isDark ? '#f3ede4' : '#24190c';
    const textMuted = isDark ? '#c4b29d' : '#65533c';

    root.dataset.theme = normalized;
    root.dataset.colorScheme = resolvedColorScheme;
    root.dataset.colorSchemePreference = colorScheme;
    root.classList.remove('mdui-theme-light', 'mdui-theme-dark', 'mdui-theme-auto');
    root.classList.add(`mdui-theme-${colorScheme}`);
    root.style.setProperty('--accent', preset.accent);
    root.style.setProperty('--accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
    root.style.setProperty('--accent-soft', preset.soft);
    root.style.setProperty('--text-main', textMain);
    root.style.setProperty('--text-muted', textMuted);
    root.style.setProperty('--panel-bg', withAlpha(panelMix, isDark ? 0.94 : 0.88));
    root.style.setProperty('--panel-border', withAlpha(preset.accent, isDark ? 0.22 : 0.12));
    root.style.setProperty('--shadow', `0 18px 60px ${withAlpha(preset.accent, isDark ? 0.2 : 0.12)}`);
    root.style.setProperty('--accent-faint', withAlpha(preset.accent, isDark ? 0.08 : 0.03));
    root.style.setProperty('--accent-soft-bg', withAlpha(preset.accent, isDark ? 0.22 : 0.08));
    root.style.setProperty('--accent-soft-bg-strong', withAlpha(preset.accent, isDark ? 0.28 : 0.1));
    root.style.setProperty('--accent-soft-bg-muted', withAlpha(preset.accent, isDark ? 0.16 : 0.05));
    root.style.setProperty('--accent-selected-start', withAlpha(preset.accent, 0.92));
    root.style.setProperty(
      '--accent-selected-end',
      withAlpha(mix('#000000', preset.accent, 0.76), 0.92),
    );
    root.style.setProperty('--accent-outline', withAlpha(preset.accent, isDark ? 0.28 : 0.18));
    root.style.setProperty('--accent-border-strong', withAlpha(preset.accent, isDark ? 0.58 : 0.42));
    root.style.setProperty('--card-glow', withAlpha(preset.accent, isDark ? 0.16 : 0.22));
    root.style.setProperty('--scrollbar-track', withAlpha(preset.accent, isDark ? 0.14 : 0.08));
    root.style.setProperty('--scrollbar-thumb-start', withAlpha(preset.accent, 0.72));
    root.style.setProperty(
      '--scrollbar-thumb-end',
      withAlpha(mix('#000000', preset.accent, 0.62), 0.72),
    );
    root.style.setProperty(
      '--treemap-surface-start',
      withAlpha(isDark ? mix('#151920', preset.soft, 0.08) : mix('#fff7eb', preset.soft, 0.3), 0.8),
    );
    root.style.setProperty(
      '--treemap-surface-mid',
      withAlpha(isDark ? mix('#1b2027', preset.soft, 0.1) : mix('#f8f0e2', preset.soft, 0.34), isDark ? 0.72 : 0.55),
    );
    root.style.setProperty('--treemap-surface-end', withAlpha(panelStrong, 0.95));
    root.style.setProperty('--switch-off-bg', withAlpha(preset.accent, isDark ? 0.34 : 0.2));
    root.style.setProperty('--switch-on-bg', withAlpha(preset.accent, 0.72));
    root.style.setProperty('--surface-raised', withAlpha(panelStrong, isDark ? 0.9 : 0.82));
    root.style.setProperty('--surface-subtle', withAlpha(panelStrong, isDark ? 0.74 : 0.62));
    root.style.setProperty('--surface-overlay', isDark ? 'rgba(18, 21, 27, 0.86)' : 'rgba(255, 255, 255, 0.82)');
    root.style.setProperty('--surface-input-start', isDark ? 'rgba(39, 45, 56, 0.96)' : 'rgba(255, 255, 255, 0.72)');
    root.style.setProperty('--surface-input-end', isDark ? 'rgba(24, 29, 36, 0.96)' : 'rgba(255, 255, 255, 0.42)');
    root.style.setProperty('--surface-button-start', isDark ? 'rgba(40, 45, 56, 0.98)' : 'rgba(255, 255, 255, 0.78)');
    root.style.setProperty('--surface-button-end', isDark ? 'rgba(25, 30, 37, 0.96)' : 'rgba(255, 255, 255, 0.56)');
    root.style.setProperty('--surface-chip', isDark ? withAlpha(preset.accent, 0.2) : preset.soft);
    root.style.setProperty('--surface-chip-muted', withAlpha(preset.accent, isDark ? 0.18 : 0.08));
    root.style.setProperty('--surface-node-border', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)');
    root.style.setProperty('--surface-node-highlight', isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.52)');
    root.style.setProperty('--surface-node-selected', isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.75)');
    root.style.setProperty('--surface-line', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.5)');
    root.style.setProperty('--surface-backdrop', isDark ? 'rgba(5, 7, 10, 0.54)' : 'rgba(30, 20, 10, 0.22)');
    root.style.setProperty('--surface-on-accent', '#ffffff');
    root.style.setProperty('--danger-bg', isDark ? 'rgba(221, 84, 64, 0.18)' : 'rgba(179, 58, 40, 0.12)');
    root.style.setProperty('--danger-text', isDark ? '#ffb5a8' : '#9d2d1e');
    root.style.setProperty(
      '--page-bg',
      `linear-gradient(180deg, ${pageStart} 0%, ${pageMid} 46%, ${pageEnd} 100%)`,
    );
    root.style.setProperty('--mdui-elevation-level1', `0 10px 30px ${withAlpha(preset.accent, isDark ? 0.14 : 0.08)}`);
    root.style.setProperty('--mdui-elevation-level4', `0 16px 44px ${withAlpha(preset.accent, isDark ? 0.24 : 0.14)}`);

    if (window.mdui?.setColorScheme) {
      window.mdui.setColorScheme(preset.accent);
    }

    if (options.persist !== false) {
      writeThemeName(normalized);
      writeColorScheme(colorScheme);
    }

    return normalized;
  }

  function preloadTheme() {
    return applyTheme(readThemeName(), { persist: false, colorScheme: readColorScheme() });
  }

  let mediaQueryBound = false;

  function bindColorSchemeWatcher() {
    if (mediaQueryBound) {
      return;
    }
    mediaQueryBound = true;

    try {
      const media = window.matchMedia?.(DARK_MEDIA_QUERY);
      media?.addEventListener?.('change', () => {
        if (readColorScheme() !== 'auto') {
          return;
        }
        applyTheme(readThemeName(), { persist: false, colorScheme: 'auto' });
      });
    } catch {
      // Ignore media query binding failures.
    }
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

    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    };
  }

  function rgbToHex({ r, g, b }) {
    return `#${[r, g, b]
      .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
      .join('')}`;
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

  window.FNTreeTheme = {
    THEME_CACHE_KEY,
    COLOR_SCHEME_CACHE_KEY,
    SETTINGS_SNAPSHOT_KEY,
    presets: THEME_PRESETS,
    applyTheme,
    preloadTheme,
    readThemeName,
    readColorScheme,
    writeThemeName,
    writeColorScheme,
    normalizeColorScheme,
    readSettingsSnapshot,
    writeSettingsSnapshot,
  };

  bindColorSchemeWatcher();
})();
