const settingScanMode = document.getElementById('settingScanMode');
const settingIgnoreHidden = document.getElementById('settingIgnoreHidden');
const settingNoCross = document.getElementById('settingNoCross');
const settingFollowSymlinks = document.getElementById('settingFollowSymlinks');
const settingConcurrent = document.getElementById('settingConcurrent');
const settingTopLimit = document.getElementById('settingTopLimit');
const saveSettingsButton = document.getElementById('saveSettingsButton');
const settingsStatus = document.getElementById('settingsStatus');

bootstrap().catch((error) => {
  showError(error.message || '初始化设置页失败');
});

saveSettingsButton.addEventListener('click', () => {
  saveSettings().catch((error) => {
    showError(error.message || '保存设置失败');
  });
});

async function bootstrap() {
  const settings = await fetchJson('/api/settings');
  const scanOptions = settings.scanOptions || {};

  settingScanMode.value = scanOptions.scanMode || 'disk-usage';
  settingIgnoreHidden.checked = Boolean(scanOptions.ignoreHidden);
  settingNoCross.checked = Boolean(scanOptions.noCross);
  settingFollowSymlinks.checked = Boolean(scanOptions.followSymlinks);
  settingConcurrent.checked = !Boolean(scanOptions.sequential);
  settingTopLimit.value = String(scanOptions.topLimit || 30);
  settingsStatus.textContent = '已加载当前默认设置';
}

async function saveSettings() {
  const topLimit = Number(settingTopLimit.value || 0);
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
          scanMode: settingScanMode.value || 'disk-usage',
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
