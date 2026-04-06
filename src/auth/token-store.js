const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.skill-market-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// 确保配置目录存在
function ensureConfigDir() {
  fs.ensureDirSync(CONFIG_DIR);
}

// 获取配置
function getConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return fs.readJsonSync(CONFIG_FILE);
    } catch (e) {
      return {};
    }
  }
  return {};
}

// 保存配置
function saveConfig(config) {
  ensureConfigDir();
  fs.writeJsonSync(CONFIG_FILE, config, { spaces: 2 });
}

// 保存 Token
function saveToken(accessToken, refreshToken, expiresAt, user) {
  const config = getConfig();
  config.accessToken = accessToken;
  config.refreshToken = refreshToken;
  config.expiresAt = expiresAt;
  config.user = user;
  saveConfig(config);
}

// 获取 Token
function getToken() {
  const config = getConfig();
  return {
    accessToken: config.accessToken,
    refreshToken: config.refreshToken,
    expiresAt: config.expiresAt,
    user: config.user
  };
}

// 清除 Token
function clearToken() {
  const config = getConfig();
  delete config.accessToken;
  delete config.refreshToken;
  delete config.expiresAt;
  delete config.user;
  saveConfig(config);
}

// 检查是否已登录
function isLoggedIn() {
  const config = getConfig();
  if (!config.accessToken) return false;
  if (config.expiresAt && Date.now() > config.expiresAt) {
    return false;
  }
  return true;
}

// 获取服务器配置
function getServerConfig() {
  const config = getConfig();
  return config.server || {
    baseURL: 'https://kirigaya.cn',
    apiBase: 'https://kirigaya.cn/api'
  };
}

// 保存服务器配置
function setServerConfig(serverConfig) {
  const config = getConfig();
  config.server = serverConfig;
  saveConfig(config);
}

module.exports = {
  getConfig,
  saveConfig,
  saveToken,
  getToken,
  clearToken,
  isLoggedIn,
  getServerConfig,
  setServerConfig,
  CONFIG_DIR,
  CONFIG_FILE
};
