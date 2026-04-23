const { Command } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

const login = require('./commands/login');
const logout = require('./commands/logout');
const list = require('./commands/list');
const upload = require('./commands/upload');
const update = require('./commands/update');
const remove = require('./commands/delete');
const runExample = require('./commands/run-example');
const token = require('./commands/token');
const { getConfig } = require('./auth/token-store');
const { applyServerMode, getServerModesHelp } = require('./config/server-modes');
const apiClient = require('./api/client');

const program = new Command();

program
  .name('skill-market-cli')
  .description(`Skill Market 命令行：管理技能与登录

全局网络（对所有子命令生效）：
  --mode <环境>   ${getServerModesHelp()}
                 未指定时优先使用 ~/.skill-market-cli/config.json 中保存的环境（登录后写入），否则为 production。

示例：
  skill-market-cli --mode development login
  skill-market-cli login --mode development
  node bin/skill-market-cli.js list --mode development`)
  .version(pkg.version, '-v, --version')
  .option('-c, --config <path>', 'config file path')
  .option('--mode <environment>', getServerModesHelp());

program.hook('preAction', () => {
  const opts = program.opts();
  const config = getConfig();
  const effectiveMode =
    opts.mode !== undefined && opts.mode !== null && opts.mode !== ''
      ? opts.mode
      : (config.mode || 'production');
  try {
    applyServerMode(effectiveMode);
    apiClient.reinit();
  } catch (e) {
    console.error(chalk.red(e.message));
    process.exit(1);
  }
});

program.hook('preAction', (thisCommand) => {
  const config = getConfig();
  if (config.user && thisCommand.args[0] !== 'login') {
    console.log(chalk.gray(`已登录：${config.user.name}`));
  }
});

// Login command
program
  .command('login')
  .description('浏览器 OAuth 登录（使用全局 --mode 指向的环境）')
  .option('--no-open', '不自动打开浏览器，仅打印授权链接')
  .action(login);

// Logout command
program
  .command('logout')
  .description('清除本地登录状态并尝试撤销服务端令牌')
  .action(logout);

// Token command
program
  .command('token [subcommand] [value]')
  .description('管理 Personal Access Token（用于 CLI 免登录）')
  .action(token);

// List command
program
  .command('list')
  .alias('ls')
  .description('List all skills')
  .option('--my', 'Show only my skills')
  .option('--json', 'Output as JSON')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-s, --size <number>', 'Page size', '20')
  .action(list);

// Upload command
program
  .command('upload <path>')
  .alias('up')
  .description('上传 Skill（交互补全字段；用户案例 + 自动采集轨迹后提交 AI 渠道）')
  .option('-n, --name <name>', 'Skill name')
  .option('-d, --description <desc>', 'Skill description/purpose')
  .option('-t, --tags <tags>', 'Tags (comma separated)')
  .option('-m, --model <model>', 'Recommended model')
  .option('-y, --yes', '跳过最终确认')
  .option('--non-interactive', '完全非交互模式：自动填充默认值，必填缺失时报错退出（适合脚本/CI）')
  .action(upload);

// Update command
program
  .command('update <id>')
  .alias('updt')
  .description('Update an existing skill')
  .option('-f, --file <path>', 'Path to SKILL.md file')
  .option('-n, --name <name>', 'Skill name')
  .option('-d, --description <desc>', 'Skill description')
  .option('-t, --tags <tags>', 'Tags (comma separated)')
  .option('-y, --yes', '跳过确认')
  .option('--non-interactive', '完全非交互模式（适合脚本/CI）')
  .action(update);

// Delete command
program
  .command('delete <id>')
  .alias('rm')
  .description('Delete a skill')
  .option('-f, --force', 'Force delete without confirmation')
  .action(remove);

// Run example command
program
  .command('run-example <path>')
  .alias('run')
  .description('Run user examples and collect AI responses')
  .option('-m, --model <model>', 'Model to use for running examples', 'claude-3-5-sonnet')
  .option('--skip-confirm', 'Skip confirmation for each example')
  .action(runExample);

// Skill guide command
program
  .command('guide')
  .description('Show skill upload guide')
  .action(() => {
    const fs = require('fs');
    const path = require('path');
    const guidePath = path.join(__dirname, 'skills', 'upload-guide', 'SKILL.md');
    if (fs.existsSync(guidePath)) {
      console.log(fs.readFileSync(guidePath, 'utf-8'));
    } else {
      console.log(chalk.yellow('未找到本地指南，请访问：https://kirigaya.cn/ktools/skillmanager'));
    }
  });

// Parse arguments
program.parse();

// Show help if no arguments
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
