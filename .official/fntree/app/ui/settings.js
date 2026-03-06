const settingScanMode = document.getElementById('settingScanMode');
const settingIgnoreHidden = document.getElementById('settingIgnoreHidden');
const settingNoCross = document.getElementById('settingNoCross');
const settingFollowSymlinks = document.getElementById('settingFollowSymlinks');
const settingConcurrent = document.getElementById('settingConcurrent');
const settingTopLimit = document.getElementById('settingTopLimit');
const topLimitDecrease = document.getElementById('topLimitDecrease');
const topLimitIncrease = document.getElementById('topLimitIncrease');
const saveSettingsButton = document.getElementById('saveSettingsButton');
const settingsStatus = document.getElementById('settingsStatus');

const settingsState = {
  scanMode: 'disk-usage',
  topLimit: 30,
};

bootstrap().catch((error) => {
  showError(error.message || '初始化设置页失败');
});

saveSettingsButton.addEventListener('click', () => {
  saveSettings().catch((error) => {
    showError(error.message || '保存设置失败');
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

async function bootstrap() {
  const settings = await fetchJson('/api/settings');
  const scanOptions = settings.scanOptions || {};

  settingsState.scanMode = scanOptions.scanMode || 'disk-usage';
  settingsState.topLimit = Number(scanOptions.topLimit || 30);
  settingIgnoreHidden.checked = Boolean(scanOptions.ignoreHidden);
  settingNoCross.checked = Boolean(scanOptions.noCross);
  settingFollowSymlinks.checked = Boolean(scanOptions.followSymlinks);
  settingConcurrent.checked = !Boolean(scanOptions.sequential);

  renderScanModeButtons();
  renderTopLimit();
  settingsStatus.textContent = '已加载当前默认设置';
}

function renderScanModeButtons() {
  settingScanMode.querySelectorAll('[data-value]').forEach((button) => {
    const selected = button.dataset.value === settingsState.scanMode;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', selected ? 'true' : 'false');
  });
}

function renderTopLimit() {
  settingTopLimit.textContent = String(settingsState.topLimit);
}

async function saveSettings() {
  const topLimit = Number(settingsState.topLimit || 0);
  if (!Number.isInteger(topLimit) || topLimit <= 0) {
    throw new Error('前 N 项必须是正整数');
  }

  saveSettingsButton.disabled = true;
  settingsStatus.textContent = '正在保存';

  try {
    await fetchJson('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scanOptions: {
          scanMode: settingsState.scanMode || 'disk-usage',
          ignoreHidden: Boolean(settingIgnoreHidden.checked),
          noCross: Boolean(settingNoCross.checked),
          followSymlinks: Boolean(settingFollowSymlinks.checked),
          sequential: !Boolean(settingConcurrent.checked),
          topLimit,
        },
      }),
    });

    settingsStatus.textContent = '设置已保存';
    showMessage('设置已保存');
  } finally {
    saveSettingsButton.disabled = false;
  }
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
    mdui.snackbar({ message });
    return;
  }
  window.alert(message);
}

function showError(message) {
  settingsStatus.textContent = message;
  showMessage(message);
}
