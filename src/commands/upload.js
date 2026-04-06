const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const YAML = require('yaml');
const { isLoggedIn } = require('../auth/token-store');
const apiClient = require('../api/client');

async function upload(skillPath, options) {
  if (!isLoggedIn()) {
    console.error(chalk.red('❌ Please login first: skill-market-cli login\n'));
    process.exit(1);
  }

  // 检查路径
  if (!fs.existsSync(skillPath)) {
    console.error(chalk.red(`❌ Path not found: ${skillPath}`));
    process.exit(1);
  }

  // 确定 SKILL.md 文件路径
  let skillFilePath;
  const stats = fs.statSync(skillPath);
  
  if (stats.isDirectory()) {
    skillFilePath = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillFilePath)) {
      console.error(chalk.red(`❌ SKILL.md not found in directory: ${skillPath}`));
      process.exit(1);
    }
  } else {
    skillFilePath = skillPath;
  }

  console.log(chalk.blue('📖 Reading SKILL.md...\n'));
  
  // 读取并解析 SKILL.md
  const skillContent = fs.readFileSync(skillFilePath, 'utf-8');
  const { frontmatter, examples } = parseSkillFile(skillContent);

  // 收集信息
  let name = options.name || frontmatter?.name;
  let description = options.description || frontmatter?.purpose || frontmatter?.description;
  let tags = options.tags ? options.tags.split(',').map(t => t.trim()) : (frontmatter?.tags || []);
  let model = options.model || frontmatter?.model;
  let rootUrl = frontmatter?.rootUrl;

  // 如果缺少必要信息，询问用户
  const questions = [];
  
  if (!name) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Skill name:',
      validate: input => input.length > 0 || 'Name is required'
    });
  }
  
  if (!description) {
    questions.push({
      type: 'input',
      name: 'description',
      message: 'Purpose/Description:',
      validate: input => input.length > 0 || 'Description is required'
    });
  }

  if (questions.length > 0) {
    const answers = await inquirer.prompt(questions);
    name = name || answers.name;
    description = description || answers.description;
  }

  // 如果没有 examples，询问是否运行案例采集
  let usageExamples = examples;
  if (!usageExamples || usageExamples.length === 0) {
    const { runExamples } = await inquirer.prompt([{
      type: 'confirm',
      name: 'runExamples',
      message: 'No usage examples found. Do you want to run example collection now?',
      default: true
    }]);

    if (runExamples) {
      console.log(chalk.gray('\nPlease run: skill-market-cli run-example ' + skillPath));
      console.log(chalk.gray('Then upload again with the collected examples.\n'));
      return;
    }
  }

  // 确认上传
  console.log(chalk.gray('\n--- Upload Summary ---'));
  console.log(`Name: ${chalk.bold(name)}`);
  console.log(`Description: ${description}`);
  console.log(`Tags: ${tags.join(', ') || 'none'}`);
  console.log(`Model: ${model || 'not specified'}`);
  console.log(`Examples: ${usageExamples?.length || 0}`);
  console.log();

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Upload this skill?',
    default: true
  }]);

  if (!confirm) {
    console.log(chalk.yellow('Upload cancelled.\n'));
    return;
  }

  // 上传
  try {
    console.log(chalk.blue('\n📤 Uploading...\n'));

    const data = {
      name,
      purpose: description,
      rootUrl: rootUrl || '',
      tags,
      usageExamples: usageExamples || [],
      model
    };

    const response = await apiClient.uploadSkill(data);

    if (response.code === 200) {
      console.log(chalk.green('✅ Skill uploaded successfully!'));
      console.log(chalk.cyan(`📝 Skill ID: ${response.data.id}`));
      console.log();
    } else {
      console.error(chalk.red('❌ Upload failed:'), response.data || 'Unknown error');
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('❌ Upload error:'), error.message);
    process.exit(1);
  }
}

// 解析 SKILL.md 文件
function parseSkillFile(content) {
  let frontmatter = null;
  let examples = [];

  // 解析 front matter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (frontmatterMatch) {
    try {
      frontmatter = YAML.parse(frontmatterMatch[1]);
    } catch (e) {
      // 忽略解析错误
    }
  }

  // 解析 usage examples（如果文件中有）
  const examplesMatch = content.match(/## Usage Examples?\s*\n([\s\S]*?)(?=##|$)/i);
  if (examplesMatch) {
    // 简单解析示例 - 可以根据实际格式改进
    const exampleText = examplesMatch[1];
    const exampleBlocks = exampleText.split(/\n\n+/).filter(b => b.trim());
    
    examples = exampleBlocks.map(block => {
      const lines = block.split('\n').filter(l => l.trim());
      return {
        prompt: lines.join('\n')
      };
    });
  }

  return { frontmatter, examples };
}

module.exports = upload;
