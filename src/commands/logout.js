const chalk = require('chalk');
const { clearToken, isLoggedIn } = require('../auth/token-store');
const apiClient = require('../api/client');

async function logout() {
  if (!isLoggedIn()) {
    console.log(chalk.yellow('⚠️  You are not logged in.\n'));
    return;
  }

  try {
    // 通知服务器登出（撤销 Token）
    await apiClient.client.post('/oauth/logout');
  } catch (e) {
    // 忽略错误
  }

  // 清除本地 Token
  clearToken();

  console.log(chalk.green('✅ Logged out successfully.\n'));
}

module.exports = logout;
