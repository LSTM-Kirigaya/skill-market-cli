const { setServerConfig, getConfig, saveConfig } = require('../auth/token-store');

const SERVER_MODES = {
  production: {
    baseURL: 'https://kirigaya.cn',
    apiBase: 'https://kirigaya.cn/api'
  },
  development: {
    baseURL: 'http://localhost:8080',
    apiBase: 'http://localhost:8080/api'
  }
};

function normalizeMode(raw) {
  if (raw == null || raw === '') return 'production';
  const m = String(raw).toLowerCase().trim();
  if (m === 'production' || m === 'prod') return 'production';
  if (m === 'development' || m === 'dev') return 'development';
  return null;
}

function applyServerMode(modeRaw) {
  const mode = normalizeMode(modeRaw);
  if (!mode) {
    throw new Error(`无效的 --mode：「${modeRaw}」。请使用 production 或 development。`);
  }
  setServerConfig(SERVER_MODES[mode]);
  const config = getConfig();
  config.mode = mode;
  saveConfig(config);
  return mode;
}

function getServerModesHelp() {
  return 'production (https://kirigaya.cn) | development (http://localhost:8080)';
}

module.exports = {
  SERVER_MODES,
  normalizeMode,
  applyServerMode,
  getServerModesHelp
};
