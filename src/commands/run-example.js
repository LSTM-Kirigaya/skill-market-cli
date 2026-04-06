const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const YAML = require('yaml');

/**
 * Run user examples and collect AI responses
 * This command reads a SKILL.md file, runs the examples through AI,
 * and collects the AI responses (thinking, toolcall, message)
 */
async function runExample(skillPath, options) {
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
  
  // 读取 SKILL.md
  const skillContent = fs.readFileSync(skillFilePath, 'utf-8');
  const { frontmatter, examples } = parseSkillFile(skillContent);

  if (!examples || examples.length === 0) {
    console.log(chalk.yellow('⚠️  No usage examples found in SKILL.md'));
    console.log(chalk.gray('Please add examples to your skill file first.\n'));
    
    // 询问是否添加示例
    const { addExample } = await inquirer.prompt([{
      type: 'confirm',
      name: 'addExample',
      message: 'Do you want to add an example now?',
      default: true
    }]);

    if (addExample) {
      await addExampleInteractively(skillFilePath, skillContent, options.model);
    }
    return;
  }

  console.log(chalk.gray(`Found ${examples.length} example(s)\n`));

  // 运行每个示例
  const collectedExamples = [];
  
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    console.log(chalk.cyan(`\n--- Example ${i + 1}/${examples.length} ---`));
    console.log(chalk.gray('User Prompt:'));
    console.log(chalk.white(example.prompt));
    console.log();

    // 询问是否运行此示例
    if (!options.skipConfirm) {
      const { runThis } = await inquirer.prompt([{
        type: 'confirm',
        name: 'runThis',
        message: 'Run this example?',
        default: true
      }]);

      if (!runThis) {
        console.log(chalk.gray('Skipped.\n'));
        continue;
      }
    }

    // 运行示例并收集 AI 响应
    const aiResponses = await runExampleAndCollect(example.prompt, options.model);
    
    collectedExamples.push({
      prompt: example.prompt,
      aiResponses,
      model: options.model
    });

    console.log(chalk.green(`✅ Collected ${aiResponses.length} AI response(s)\n`));
  }

  if (collectedExamples.length === 0) {
    console.log(chalk.yellow('No examples were run.\n'));
    return;
  }

  // 保存结果
  console.log(chalk.blue('💾 Saving results...\n'));
  
  const outputData = {
    model: options.model,
    examples: collectedExamples
  };

  // 保存到 .skill-examples.json
  const outputPath = path.join(path.dirname(skillFilePath), '.skill-examples.json');
  fs.writeJsonSync(outputPath, outputData, { spaces: 2 });

  console.log(chalk.green('✅ Examples saved to:'), chalk.cyan(outputPath));
  console.log();
  console.log(chalk.gray('You can now upload your skill with the collected examples:'));
  console.log(chalk.cyan(`   skill-market-cli upload ${skillPath}\n`));
}

/**
 * 解析 SKILL.md 文件
 */
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

  // 解析 usage examples
  const examplesSection = content.match(/## Usage Examples?\s*\n([\s\S]*?)(?=##|$)/i);
  if (examplesSection) {
    // 支持两种格式：
    // 1. YAML front matter 中的 examples 数组
    if (frontmatter?.examples) {
      examples = frontmatter.examples.map(ex => ({
        prompt: typeof ex === 'string' ? ex : ex.prompt
      }));
    }
    
    // 2. 从 Markdown 内容中解析
    if (examples.length === 0) {
      const exampleMatches = examplesSection[1].match(/### Example \d+\s*\n([\s\S]*?)(?=### Example \d+|##|$)/g);
      if (exampleMatches) {
        examples = exampleMatches.map(match => {
          const promptMatch = match.match(/\*\*User:\*\*\s*\n?([\s\S]*?)(?=\*\*AI:|$)/i);
          return {
            prompt: promptMatch ? promptMatch[1].trim() : match.trim()
          };
        });
      }
    }
  }

  // 如果没有找到，询问用户输入
  if (examples.length === 0 && frontmatter?.prompt) {
    examples = [{ prompt: frontmatter.prompt }];
  }

  return { frontmatter, examples };
}

/**
 * 交互式添加示例
 */
async function addExampleInteractively(skillFilePath, skillContent, model) {
  console.log(chalk.blue('\n📝 Add a new usage example\n'));

  const { prompt } = await inquirer.prompt([{
    type: 'editor',
    name: 'prompt',
    message: 'Enter the user prompt:',
    validate: input => input.trim().length > 0 || 'Prompt is required'
  }]);

  // 运行并收集 AI 响应
  const aiResponses = await runExampleAndCollect(prompt, model);

  // 保存到 .skill-examples.json
  const outputPath = path.join(path.dirname(skillFilePath), '.skill-examples.json');
  let existingData = { model, examples: [] };
  
  if (fs.existsSync(outputPath)) {
    existingData = fs.readJsonSync(outputPath);
  }

  existingData.examples.push({
    prompt: prompt.trim(),
    aiResponses,
    model
  });

  fs.writeJsonSync(outputPath, existingData, { spaces: 2 });

  console.log(chalk.green('✅ Example saved!\n'));

  // 询问是否继续添加
  const { addMore } = await inquirer.prompt([{
    type: 'confirm',
    name: 'addMore',
    message: 'Add another example?',
    default: false
  }]);

  if (addMore) {
    await addExampleInteractively(skillFilePath, skillContent, model);
  }
}

/**
 * 运行示例并收集 AI 响应
 * 这里需要集成 AI API，目前使用模拟数据
 */
async function runExampleAndCollect(prompt, model) {
  console.log(chalk.blue('\n🤖 Running example with AI...'));
  console.log(chalk.gray(`Model: ${model}\n`));

  // 这里应该调用实际的 AI API
  // 目前模拟一个典型的 AI 响应流程
  
  console.log(chalk.gray('Simulating AI response collection...'));
  console.log(chalk.gray('In production, this would call the AI API and capture:'));
  console.log(chalk.gray('  1. Thinking steps'));
  console.log(chalk.gray('  2. Tool calls'));
  console.log(chalk.gray('  3. Final message\n'));

  // 模拟 AI 响应
  const simulatedResponses = [
    {
      type: 'thinking',
      content: `Let me analyze this request: "${prompt}". The user wants me to help them with a specific task. I'll break this down into steps and execute the appropriate tools.`
    },
    {
      type: 'toolcall',
      toolName: 'read_file',
      toolInput: { path: './README.md' }
    },
    {
      type: 'toolcall',
      toolName: 'write_file',
      toolInput: { 
        path: './output.txt', 
        content: `Processed: ${prompt}` 
      }
    },
    {
      type: 'message',
      content: `I've processed your request: "${prompt}". Here's what I did:\n\n1. Analyzed the requirements\n2. Read the relevant files\n3. Generated the output\n\nThe task is now complete!`
    }
  ];

  // 模拟处理时间
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(chalk.gray('Collected responses:'));
  simulatedResponses.forEach((resp, i) => {
    const icon = resp.type === 'thinking' ? '💭' : 
                 resp.type === 'toolcall' ? '🔧' : '💬';
    console.log(chalk.gray(`  ${icon} [${resp.type}]`));
  });
  console.log();

  return simulatedResponses;
}

module.exports = runExample;
