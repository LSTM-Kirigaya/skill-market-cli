const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const YAML = require('yaml');
const { isLoggedIn } = require('../auth/token-store');
const apiClient = require('../api/client');

async function update(skillId, options) {
  if (!isLoggedIn()) {
    console.error(chalk.red('❌ Please login first: skill-market-cli login\n'));
    process.exit(1);
  }

  try {
    // 获取现有 skill 信息
    console.log(chalk.blue('📖 Loading skill info...\n'));
    const detailResponse = await apiClient.getSkillDetail(skillId);
    
    if (detailResponse.code !== 200) {
      console.error(chalk.red('❌ Skill not found'));
      process.exit(1);
    }

    const existingSkill = detailResponse.data;

    let name = options.name || existingSkill.name;
    let description = options.description || existingSkill.purpose;
    let tags = options.tags ? options.tags.split(',').map(t => t.trim()) : existingSkill.tags;
    let usageExamples = existingSkill.usageExamples || [];

    // 如果提供了文件，读取新的 SKILL.md
    if (options.file) {
      const skillPath = options.file;
      if (!fs.existsSync(skillPath)) {
        console.error(chalk.red(`❌ File not found: ${skillPath}`));
        process.exit(1);
      }

      let skillFilePath;
      const stats = fs.statSync(skillPath);
      
      if (stats.isDirectory()) {
        skillFilePath = path.join(skillPath, 'SKILL.md');
      } else {
        skillFilePath = skillPath;
      }

      if (fs.existsSync(skillFilePath)) {
        const skillContent = fs.readFileSync(skillFilePath, 'utf-8');
        const { frontmatter } = parseSkillFile(skillContent);
        
        name = options.name || frontmatter?.name || name;
        description = options.description || frontmatter?.purpose || frontmatter?.description || description;
        
        if (frontmatter?.tags) {
          tags = options.tags ? options.tags.split(',').map(t => t.trim()) : frontmatter.tags;
        }
      }
    }

    // 确认更新
    console.log(chalk.gray('\n--- Update Summary ---'));
    console.log(`Name: ${chalk.bold(name)}`);
    console.log(`Description: ${description}`);
    console.log(`Tags: ${tags?.join(', ') || 'none'}`);
    console.log(`Examples: ${usageExamples?.length || 0}`);
    console.log();

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Update this skill?',
      default: true
    }]);

    if (!confirm) {
      console.log(chalk.yellow('Update cancelled.\n'));
      return;
    }

    // 执行更新
    console.log(chalk.blue('\n📤 Updating...\n'));

    const data = {
      name,
      purpose: description,
      rootUrl: existingSkill.rootUrl,
      tags,
      usageExamples
    };

    const response = await apiClient.updateSkill(skillId, data);

    if (response.code === 200) {
      console.log(chalk.green('✅ Skill updated successfully!\n'));
    } else {
      console.error(chalk.red('❌ Update failed:'), response.data || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ Update error:'), error.message);
    process.exit(1);
  }
}

// 解析 SKILL.md 文件
function parseSkillFile(content) {
  let frontmatter = null;

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (frontmatterMatch) {
    try {
      frontmatter = YAML.parse(frontmatterMatch[1]);
    } catch (e) {
      // 忽略解析错误
    }
  }

  return { frontmatter };
}

module.exports = update;
