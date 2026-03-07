(function () {
  'use strict';

  const THEME_CACHE_KEY = 'fntree.theme';
  const SETTINGS_SNAPSHOT_KEY = 'fntree.settings';

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

  function writeThemeName(themeName) {
    const normalized = THEME_PRESETS[themeName] ? themeName : 'cinnamon';
    writeJsonCache(THEME_CACHE_KEY, normalized);
  }

  function applyTheme(themeName, options = {}) {
    const normalized = THEME_PRESETS[themeName] ? themeName : 'cinnamon';
    const preset = THEME_PRESETS[normalized];
    const root = document.documentElement;
    const accentRgb = hexToRgb(preset.accent);
    const panelMix = mix('#fffaf4', preset.soft, 0.34);
    const panelStrong = mix('#ffffff', preset.soft, 0.18);

    root.dataset.theme = normalized;
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
    root.style.setProperty(
      '--accent-selected-end',
      withAlpha(mix('#000000', preset.accent, 0.76), 0.92),
    );
    root.style.setProperty('--accent-outline', withAlpha(preset.accent, 0.18));
    root.style.setProperty('--accent-border-strong', withAlpha(preset.accent, 0.42));
    root.style.setProperty('--card-glow', withAlpha(preset.accent, 0.22));
    root.style.setProperty('--scrollbar-track', withAlpha(preset.accent, 0.08));
    root.style.setProperty('--scrollbar-thumb-start', withAlpha(preset.accent, 0.72));
    root.style.setProperty(
      '--scrollbar-thumb-end',
      withAlpha(mix('#000000', preset.accent, 0.62), 0.72),
    );
    root.style.setProperty('--treemap-surface-start', withAlpha(mix('#fff7eb', preset.soft, 0.3), 0.8));
    root.style.setProperty('--treemap-surface-mid', withAlpha(mix('#f8f0e2', preset.soft, 0.34), 0.55));
    root.style.setProperty('--treemap-surface-end', withAlpha(panelStrong, 0.95));
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
    root.style.setProperty('--mdui-color-primary', preset.accent);
    root.style.setProperty('--mdui-color-outline-variant', withAlpha(preset.accent, 0.22));
    root.style.setProperty('--mdui-color-surface-container', withAlpha(panelMix, 0.96));
    root.style.setProperty('--mdui-color-surface-container-high', withAlpha(panelStrong, 0.98));
    root.style.setProperty('--mdui-color-on-surface', '#24190c');
    root.style.setProperty('--mdui-elevation-level1', `0 10px 30px ${withAlpha(preset.accent, 0.08)}`);
    root.style.setProperty('--mdui-elevation-level4', `0 16px 44px ${withAlpha(preset.accent, 0.14)}`);

    if (window.mdui?.setColorScheme) {
      window.mdui.setColorScheme(preset.accent);
    }

    if (options.persist !== false) {
      writeThemeName(normalized);
    }

    return normalized;
  }

  function preloadTheme() {
    return applyTheme(readThemeName(), { persist: false });
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
    SETTINGS_SNAPSHOT_KEY,
    presets: THEME_PRESETS,
    applyTheme,
    preloadTheme,
    readThemeName,
    writeThemeName,
    readSettingsSnapshot,
    writeSettingsSnapshot,
  };
})();
