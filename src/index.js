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
const { getConfig } = require('./auth/token-store');

const program = new Command();

program
  .name('skill-market-cli')
  .description('CLI tool for managing skills on Skill Market')
  .version(pkg.version, '-v, --version')
  .option('-c, --config <path>', 'config file path')
  .hook('preAction', (thisCommand) => {
    // 显示欢迎信息
    const config = getConfig();
    if (config.user && thisCommand.args[0] !== 'login') {
      console.log(chalk.gray(`Logged in as: ${config.user.name}`));
    }
  });

// Login command
program
  .command('login')
  .description('Login to Skill Market')
  .option('--no-open', 'Do not open browser automatically')
  .action(login);

// Logout command
program
  .command('logout')
  .description('Logout from Skill Market')
  .action(logout);

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
  .description('Upload a new skill')
  .option('-n, --name <name>', 'Skill name')
  .option('-d, --description <desc>', 'Skill description/purpose')
  .option('-t, --tags <tags>', 'Tags (comma separated)')
  .option('-m, --model <model>', 'Recommended model')
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
      console.log(chalk.yellow('Guide not found. Please visit https://kirigaya.cn/ktools/skillmanager'));
    }
  });

// Parse arguments
program.parse();

// Show help if no arguments
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
