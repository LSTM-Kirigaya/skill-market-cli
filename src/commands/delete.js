const chalk = require('chalk');
const inquirer = require('inquirer');
const { isLoggedIn } = require('../auth/token-store');
const apiClient = require('../api/client');

async function remove(skillId, options) {
  if (!isLoggedIn()) {
    console.error(chalk.red('❌ Please login first: skill-market-cli login\n'));
    process.exit(1);
  }

  try {
    // 获取 skill 信息
    const detailResponse = await apiClient.getSkillDetail(skillId);
    
    if (detailResponse.code !== 200) {
      console.error(chalk.red('❌ Skill not found'));
      process.exit(1);
    }

    const skill = detailResponse.data;

    console.log(chalk.yellow('\n⚠️  You are about to delete:'));
    console.log(`   ${chalk.bold(skill.name)}`);
    console.log(`   ${chalk.gray(skill.purpose || 'No description')}`);
    console.log();

    // 确认删除
    let confirm = options.force;
    
    if (!confirm) {
      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('Are you sure? This action cannot be undone.'),
        default: false
      }]);
      confirm = answer.confirm;
    }

    if (!confirm) {
      console.log(chalk.gray('Deletion cancelled.\n'));
      return;
    }

    // 执行删除
    console.log(chalk.blue('\n🗑️  Deleting...\n'));

    const response = await apiClient.deleteSkill(skillId);

    if (response.code === 200) {
      console.log(chalk.green('✅ Skill deleted successfully.\n'));
    } else {
      console.error(chalk.red('❌ Deletion failed:'), response.data || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ Delete error:'), error.message);
    process.exit(1);
  }
}

module.exports = remove;
