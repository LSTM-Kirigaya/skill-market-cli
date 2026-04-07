const chalk = require('chalk');
const { isLoggedIn } = require('../auth/token-store');
const { login: oauthLogin } = require('../auth/oauth');

async function login(options) {
  if (isLoggedIn()) {
    console.log(chalk.yellow('当前已处于登录状态。'));
    console.log(chalk.gray('如需重新登录，请先执行：skill-market-cli logout'));
    console.log('');
    return;
  }

  const success = await oauthLogin(options);

  if (!success) {
    process.exit(1);
  }
}

module.exports = login;
