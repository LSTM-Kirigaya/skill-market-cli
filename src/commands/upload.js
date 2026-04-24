const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const { isLoggedIn, getPersonalAccessToken, printLoginHelp } = require('../auth/token-store');
const apiClient = require('../api/client');
const { runExampleAndCollect } = require('../lib/run-example-collect');
const { getRecommendedModel, getDetectedEnv, FALLBACK_MODEL } = require('../lib/detect-environment');
const {
  parseSkillMarkdown,
  loadDotSkillExamples,
  promptOnlyExamples
} = require('../lib/skill-upload-helpers');

/**
 * 交互补全：名称、描述、标签、模型、rootUrl、用户案例 + 可选运行采集轨迹
 */
async function upload(skillPath, options = {}) {
  if (!isLoggedIn() && !getPersonalAccessToken()) {
    printLoginHelp();
    process.exit(1);
  }

  if (!fs.existsSync(skillPath)) {
    console.error(chalk.red(`路径不存在：${skillPath}`));
    process.exit(1);
  }

  let skillFilePath;
  const stats = fs.statSync(skillPath);
  if (stats.isDirectory()) {
    skillFilePath = path.join(skillPath, 'SKILL.md');
    if (!fs.existsSync(skillFilePath)) {
      console.error(chalk.red(`目录中未找到 SKILL.md：${skillPath}`));
      process.exit(1);
    }
  } else {
    skillFilePath = skillPath;
  }

  const skillDir = path.dirname(skillFilePath);
  console.log(chalk.gray(`读取：${skillFilePath}\n`));

  const skillContent = fs.readFileSync(skillFilePath, 'utf-8');
  const { frontmatter, examples: examplesFromMd } = parseSkillMarkdown(skillContent);

  let name = options.name || frontmatter?.name;
  let description =
    options.description || frontmatter?.purpose || frontmatter?.description;
  let tags = options.tags
    ? options.tags.split(',').map((t) => t.trim())
    : frontmatter?.tags || [];
  let model = options.model || frontmatter?.model;
  let rootUrl = frontmatter?.rootUrl;

  const fromJson = loadDotSkillExamples(skillDir);
  let usageExamples = fromJson;

  if (!usageExamples || usageExamples.length === 0) {
    const raw = promptOnlyExamples(examplesFromMd);
    if (raw.length > 0) {
      usageExamples = raw.map((ex) => ({
        prompt: ex.prompt,
        aiResponses: ex.aiResponses || [],
        model: ex.model || model || ''
      }));
    }
  }

  const nonInteractive = options.nonInteractive === true;

  const needName = !name || !String(name).trim();
  const needDesc = !description || !String(description).trim();
  if (needName || needDesc) {
    if (nonInteractive) {
      const missing = [needName && 'name（-n）', needDesc && 'description（-d）'].filter(Boolean).join('、');
      console.error(chalk.red(`非交互模式缺少必填字段：${missing}`));
      console.error(chalk.yellow('请通过 CLI 参数提供，或在 SKILL.md frontmatter 中填写。'));
      process.exit(1);
    }
    const answers = await inquirer.prompt(
      [
        needName && {
          type: 'input',
          name: 'name',
          message: 'Skill 名称（必填）：',
          validate: (input) => (input && String(input).trim() ? true : '不能为空')
        },
        needDesc && {
          type: 'input',
          name: 'description',
          message: '用途 / 描述（必填）：',
          validate: (input) => (input && String(input).trim() ? true : '不能为空')
        }
      ].filter(Boolean)
    );
    if (answers.name) name = answers.name;
    if (answers.description) description = answers.description;
  }

  // 模型默认值（用于采集与提交）
  const envInfo = getDetectedEnv();
  const hardcodedDefault = FALLBACK_MODEL;

  if (!model || !String(model).trim()) {
    if (nonInteractive) {
      model = envInfo.env ? envInfo.model : hardcodedDefault;
    } else {
      const choices = [];

      if (envInfo.env) {
        choices.push({
          name: `使用识别模型: ${envInfo.model} (${envInfo.displayName})`,
          value: envInfo.model
        });
      }

      choices.push({
        name: `使用默认模型: ${hardcodedDefault}`,
        value: hardcodedDefault
      });

      choices.push({
        name: '其他（手动输入）',
        value: 'custom'
      });

      const { selectedModel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedModel',
          message: '选择推荐模型（用于案例采集与提交，建议与线上一致）：',
          choices,
          default: envInfo.env ? envInfo.model : hardcodedDefault
        }
      ]);

      if (selectedModel === 'custom') {
        const { customModel } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customModel',
            message: '请输入模型名称：',
            default: envInfo.env ? envInfo.model : hardcodedDefault
          }
        ]);
        model = customModel || hardcodedDefault;
      } else {
        model = selectedModel;
      }
    }
  }

  const modelFinal = String(model).trim();

  // 必须有至少一条「用户案例」且含轨迹：若无则交互式收集
  usageExamples = await ensureUsageExamplesWithTrace({
    initial: usageExamples,
    model: modelFinal,
    nonInteractive
  });

  if (!tags || tags.length === 0) {
    if (nonInteractive) {
      tags = ['general'];
    } else {
      const { tagStr } = await inquirer.prompt([
        {
          type: 'input',
          name: 'tagStr',
          message: '标签（逗号分隔，至少一个）：',
          default: 'general',
          validate: (input) =>
            input && String(input).trim() ? true : '至少填写一个标签'
        }
      ]);
      tags = tagStr.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }

  if (!rootUrl || !String(rootUrl).trim()) {
    if (nonInteractive) {
      rootUrl = `file://${path.resolve(skillFilePath)}`;
    } else {
      const { ru } = await inquirer.prompt([
        {
          type: 'input',
          name: 'ru',
          message: 'SKILL 根资源 URL（可填 GitHub raw 或本地文件）：',
          default: `file://${path.resolve(skillFilePath)}`
        }
      ]);
      rootUrl = ru || `file://${path.resolve(skillFilePath)}`;
    }
  }

  console.log(chalk.gray('\n--- 上传摘要 ---'));
  console.log(`名称：${chalk.bold(name)}`);
  console.log(`描述：${description}`);
  console.log(`标签：${tags.join(', ')}`);
  console.log(`模型：${modelFinal}`);
  console.log(`rootUrl：${rootUrl}`);
  console.log(`案例条数：${usageExamples.length}（每条含 prompt + 轨迹）`);
  console.log('');

  let confirm = options.yes === true || nonInteractive;
  if (!confirm) {
    const ans = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认提交到 Skill Market？',
        default: true
      }
    ]);
    confirm = ans.confirm;
  }

  if (!confirm) {
    console.log(chalk.yellow('已取消上传。\n'));
    return;
  }

  // 写入 .skill-examples.json 便于复查与再次上传
  try {
    const outPath = path.join(skillDir, '.skill-examples.json');
    fs.writeJsonSync(
      outPath,
      {
        model: modelFinal,
        examples: usageExamples.map((e) => ({
          prompt: e.prompt,
          aiResponses: e.aiResponses,
          model: e.model || modelFinal
        }))
      },
      { spaces: 2 }
    );
    console.log(chalk.gray(`已保存本地示例与轨迹：${outPath}`));
  } catch {
    // ignore
  }

  try {
    console.log(chalk.gray('\n正在上传…\n'));

    const tagsFinal = tags.map((t) => String(t).trim()).filter(Boolean);
    const data = {
      name: String(name).trim(),
      purpose: String(description).trim(),
      rootUrl: String(rootUrl).trim(),
      tags: tagsFinal,
      usageExamples,
      model: modelFinal
    };

    const response = await apiClient.uploadSkill(data);

    if (response.code === 200) {
      console.log(chalk.green('上传成功'));
      console.log(chalk.gray(`Skill ID：${response.data.id}`));
      console.log('');
    } else {
      console.error(chalk.red('上传失败：'), response.data || '未知错误');
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('上传出错：'), error.message);
    if (error.response) {
      console.error(chalk.red('状态码：'), error.response.status);
      console.error(chalk.red('响应数据：'), JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

/**
 * 保证至少一条案例；若仅有 prompt 无轨迹，则询问是否运行采集
 */
async function ensureUsageExamplesWithTrace({ initial, model, nonInteractive = false }) {
  let list = Array.isArray(initial) ? [...initial] : [];

  const hasTrace = (ex) =>
    ex &&
    ex.prompt &&
    String(ex.prompt).trim() &&
    Array.isArray(ex.aiResponses) &&
    ex.aiResponses.length > 0;

  const valid = list.filter((ex) => ex && String(ex.prompt || '').trim());
  const allHaveTrace = valid.length > 0 && valid.every(hasTrace);

  if (allHaveTrace) {
    return valid.map((ex) => ({
      prompt: String(ex.prompt).trim(),
      aiResponses: ex.aiResponses,
      model: ex.model || model
    }));
  }

  if (valid.length > 0 && !allHaveTrace) {
    if (nonInteractive) {
      console.log(chalk.gray('非交互模式：自动采集缺失的轨迹…'));
    } else {
      console.log(chalk.gray('检测到 SKILL.md 中已有案例文本，但缺少轨迹。将逐条运行采集。\n'));
    }
    const out = [];
    for (const ex of valid) {
      const trace = await runExampleAndCollect(ex.prompt, model);
      out.push({
        prompt: String(ex.prompt).trim(),
        aiResponses: trace,
        model
      });
    }
    return out;
  }

  if (nonInteractive) {
    console.error(chalk.red('非交互模式缺少用户案例及轨迹。'));
    console.error(chalk.yellow('请预先创建 .skill-examples.json，或提供带有 usageExamples 的 SKILL.md。'));
    process.exit(1);
  }

  console.log(
    chalk.yellow(
      '上传至 Skill Market 需要至少一条「用户案例」及对应采集轨迹（thinking / toolcall / message）。\n'
    )
  );

  const collected = [];
  let addMore = true;
  while (addMore) {
    const { promptText } = await inquirer.prompt([
      {
        type: 'input',
        name: 'promptText',
        message: '请输入一条用户测试案例（终端可多行请用 \\n 分段，或分多次添加）：',
        validate: (input) =>
          input && String(input).trim() ? true : '案例内容不能为空'
      }
    ]);

    const aiResponses = await runExampleAndCollect(promptText.trim(), model);

    collected.push({
      prompt: promptText.trim(),
      aiResponses,
      model
    });

    const { again } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'again',
        message: '是否再添加一条用户案例？',
        default: false
      }
    ]);
    addMore = again;
  }

  if (collected.length === 0) {
    console.error(chalk.red('未提供任何用户案例，无法上传。'));
    process.exit(1);
  }

  return collected;
}

module.exports = upload;
