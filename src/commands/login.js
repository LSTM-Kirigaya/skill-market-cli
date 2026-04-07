const chalk = require('chalk');
const { isLoggedIn } = require('../auth/token-store');
const { login: oauthLogin } = require('../auth/oauth');

async function login(options) {
  // 检查是否已登录
  if (isLoggedIn()) {
    console.log(chalk.yellow('⚠️  You are already logged in.'));
    console.log(chalk.gray('Use "skill-market-cli logout" to logout first.\n'));
    return;
  }

  // 执行登录（--mode 已在全局 preAction 中写入配置并设置 API 基址）
  const success = await oauthLogin(options);
  
  if (!success) {
    process.exit(1);
  }
}

module.exports = login;
