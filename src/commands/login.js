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

  // 执行登录
  const success = await oauthLogin(options);
  
  if (!success) {
    process.exit(1);
  }
}

module.exports = login;
