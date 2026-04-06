const chalk = require('chalk');
const { isLoggedIn, getToken } = require('../auth/token-store');
const apiClient = require('../api/client');

async function list(options) {
  if (!isLoggedIn()) {
    console.error(chalk.red('❌ Please login first: skill-market-cli login\n'));
    process.exit(1);
  }

  try {
    let response;
    
    if (options.my) {
      console.log(chalk.blue('📦 Loading your skills...\n'));
      response = await apiClient.getMySkills();
    } else {
      console.log(chalk.blue('📦 Loading all skills...\n'));
      response = await apiClient.listSkills(parseInt(options.page), parseInt(options.size));
    }

    if (response.code !== 200) {
      console.error(chalk.red('❌ Failed to load skills:'), response.data || 'Unknown error');
      process.exit(1);
    }

    const skills = response.data?.list || [];
    const total = response.data?.total || 0;

    if (options.json) {
      console.log(JSON.stringify(skills, null, 2));
      return;
    }

    if (skills.length === 0) {
      console.log(chalk.yellow('No skills found.\n'));
      return;
    }

    // 显示表格
    console.log(chalk.gray(`Total: ${total} skills\n`));
    
    skills.forEach((skill, index) => {
      const num = index + 1;
      const tags = skill.tags?.map(t => chalk.cyan(`#${t}`)).join(' ') || '';
      const likes = skill.likeCount ? chalk.red(`♥ ${skill.likeCount}`) : '';
      
      console.log(`${chalk.gray(num + '.')} ${chalk.bold(skill.name)} ${likes}`);
      console.log(`   ${chalk.gray(skill.purpose || 'No description')}`);
      if (tags) console.log(`   ${tags}`);
      console.log(`   ${chalk.gray('ID:')} ${skill.id} ${chalk.gray('Creator:')} ${skill.creator}`);
      console.log();
    });

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

module.exports = list;
