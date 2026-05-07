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
 * normalizeTagsForUpload 规范化用户/AI 提交的原始标签：
 * 1. 拆分连字符复合标签（如 "email-ses-smtp" → ["SES", "SMTP"]），滤除过于泛化的片段
 * 2. 拆分中文复合标签（按常见分隔符）
 * 3. 去重 + 去空
 *
 * 约束原则（抽象级别，不绑定具体案例）：
 * - 原子性：每个 tag 只表示一个明确的技术/平台/概念，不组合多个语义单元
 * - 抽象层级：优先使用技术名词本身而非其应用场景；能用协议/标准名就不用产品名
 * - 避免泛化词：过于宽泛的片段（如 "email", "service", "kit", "tool"）不作为独立 tag，
 *   除非它本身就是该 Skill 的核心主题且无更具体的替代词
 */
function normalizeTagsForUpload(tags) {
  // 过于泛化的词（与具体技术无关或涵盖面过广），复合 tag 拆分后自动滤除
  const genericWords = new Set([
    'email', 'service', 'kit', 'tool', 'api', 'app', 'lib', 'utils',
    'helper', 'core', 'base', 'common', 'demo', 'example', 'test',
    'simple', 'basic', 'advanced', 'pro', 'lite', 'plus'
  ]);

  const result = [];
  for (const raw of tags) {
    const trimmed = String(raw).trim();
    if (!trimmed) continue;

    // 1. 拆分连字符复合词
    if (trimmed.includes('-') && !trimmed.startsWith('file-') && !trimmed.startsWith('os-')) {
      const parts = trimmed.split('-').map(p => p.trim()).filter(Boolean);
      const meaningful = parts.filter(p => !genericWords.has(p.toLowerCase()));
      if (meaningful.length > 0) {
        for (const p of meaningful) result.push(p);
        continue;
      }
    }

    // 2. 拆分中文复合词（含空格）
    if (/[一-鿿]/.test(trimmed) && /\s/.test(trimmed)) {
      const parts = trimmed.split(/\s+/).filter(Boolean);
      for (const p of parts) result.push(p);
      continue;
    }

    // 3. 尝试检测中文连写复合词（无空格、多概念粘连）
    // 常见技术后缀可作为拆分边界：云、服务、平台、协议、框架、工具、系统
    const cnSplitHints = ['云', '服务', '平台', '协议', '框架', '工具', '系统', '邮件', '推送', '验证'];
    let didSplit = false;
    for (const hint of cnSplitHints) {
      const idx = trimmed.indexOf(hint);
      if (idx > 0 && idx + hint.length < trimmed.length) {
        // hint 在中间，拆分
        const before = trimmed.substring(0, idx + hint.length);
        const after = trimmed.substring(idx + hint.length);
        result.push(before, after);
        didSplit = true;
        break;
      }
    }
    if (didSplit) continue;

    result.push(trimmed);
  }

  // 常见缩写/协议名规范化：纯字母 2-4 字符全大写
  const normalized = result.map(t => {
    if (/^[a-zA-Z]{2,4}$/.test(t)) return t.toUpperCase();
    return t;
  });

  // 去重（大小写不敏感）
  const seen = new Set();
  return normalized.filter(t => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
<<<<<<< HEAD
    const { m } = await inquirer.prompt([
      {
        type: 'input',
        name: 'm',
        message: '推荐模型（必填，如 claude-sonnet-4-6 / gpt-4o / deepseek-chat，请填写实际使用的模型）：',
        validate: (input) => (input && String(input).trim() ? true : '模型名不能为空，请填写你当前使用的模型名称')
      }
    ]);
    model = String(m || '').trim();
    if (!model) {
      console.error(chalk.red('模型名不能为空，上传已取消。'));
      process.exit(1);
=======
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
>>>>>>> f29e3eba44ec966587ed1ccaf466172a7664aa89
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

    const tagsRaw = tags.map((t) => String(t).trim()).filter(Boolean);
    const tagsFinal = normalizeTagsForUpload(tagsRaw);

    if (tagsFinal.length !== tagsRaw.length) {
      console.log(chalk.yellow(`标签规范化：${tagsRaw.length} → ${tagsFinal.length}（拆分复合词/去重）`));
      console.log(chalk.gray(`  原始: [${tagsRaw.join(', ')}]`));
      console.log(chalk.gray(`  规范: [${tagsFinal.join(', ')}]`));
    }

    // Resolve tags against SkillTag vocabulary (batch)
    console.log(chalk.gray('\nResolving tags...'));
    const resolvedTags = [];
    try {
      const resolveResult = await apiClient.resolveSkillTags(tagsFinal);
      if (resolveResult.code === 200 && resolveResult.data) {
        const unmatchedTags = [];

        for (const [rawTag, result] of Object.entries(resolveResult.data)) {
          if (result.status === 'matched' && result.tag) {
            resolvedTags.push(result.tag.nameEn);
            console.log(chalk.gray(`  ${rawTag} -> ${result.tag.nameZh} (${result.tag.nameEn})`));
          } else {
            // unmatched: collect for later decision
            const suggestions = result.suggestions || [];
            unmatchedTags.push({ rawTag, suggestions });
          }
        }

        // Handle unmatched tags interactively
        if (unmatchedTags.length > 0) {
          console.log(chalk.yellow(`\n以下 ${unmatchedTags.length} 个标签在数据库中未找到：`));
          for (const { rawTag, suggestions } of unmatchedTags) {
            console.log(chalk.yellow(`\n  ✗ "${rawTag}" 不存在`));
            if (suggestions.length > 0) {
              console.log(chalk.gray(`    数据库中可能相关的标签：`));
              for (const s of suggestions) {
                console.log(chalk.gray(`      - ${s.nameZh} (${s.nameEn}) [id=${s.id}]`));
              }
            } else {
              console.log(chalk.gray(`    未找到相似标签`));
            }
          }

          // Let user/AI decide for each unmatched tag
          for (const { rawTag, suggestions } of unmatchedTags) {
            const choices = [
              { name: `创建新标签 "${rawTag}"`, value: 'create' },
              ...suggestions.map(s => ({
                name: `复用 "${s.nameZh}" (${s.nameEn})`,
                value: s.nameEn
              })),
              { name: '跳过此标签', value: 'skip' }
            ];

            // In non-interactive mode, auto-create if no suggestions, otherwise ask
            if (options.yes) {
              // Auto mode: 仅在建议足够匹配时才复用，否则创建新 tag
              // 匹配条件：建议的 nameEn 与原始 tag 完全相同（大小写不敏感），
              // 或原始 tag 作为独立单词出现在建议中（如 "AI" 匹配 "AI Agent"）
              const strongMatch = suggestions.find(s => {
                const sLower = s.nameEn.toLowerCase();
                const tLower = rawTag.toLowerCase();
                if (sLower === tLower) return true;
                // 原始 tag 作为独立单词出现在建议中，且建议不超过 2 个单词
                // （避免 "SES" 匹配到 "email-ses-smtp" 这类长复合词）
                const parts = sLower.split(/[-_\s]+/);
                if (parts.length <= 2 && parts.includes(tLower)) return true;
                return false;
              });
              if (strongMatch) {
                resolvedTags.push(strongMatch.nameEn);
                console.log(chalk.gray(`  [auto] ${rawTag} -> ${strongMatch.nameEn} (匹配: ${strongMatch.nameZh})`));
              } else if (suggestions.length > 0) {
                // 有建议但不够强 → 仍然创建新 tag（更保守，避免错误合并）
                const nameEn = rawTag.replace(/\s+/g, '-').toLowerCase();
                try {
                  const createResult = await apiClient.createSkillTag(rawTag, nameEn);
                  if (createResult.code === 200 && createResult.data) {
                    resolvedTags.push(createResult.data.nameEn);
                    console.log(chalk.green(`  [auto] 已创建标签: ${rawTag} (${createResult.data.nameEn})`));
                  } else {
                    resolvedTags.push(rawTag);
                  }
                } catch {
                  resolvedTags.push(rawTag);
                }
              } else {
                const nameEn = rawTag.replace(/\s+/g, '-').toLowerCase();
                try {
                  const createResult = await apiClient.createSkillTag(rawTag, nameEn);
                  if (createResult.code === 200 && createResult.data) {
                    resolvedTags.push(createResult.data.nameEn);
                    console.log(chalk.green(`  [auto] 已创建标签: ${rawTag} (${createResult.data.nameEn})`));
                  } else {
                    console.log(chalk.yellow(`  [auto] 跳过: ${rawTag}`));
                  }
                } catch {
                  console.log(chalk.yellow(`  [auto] 创建失败，跳过: ${rawTag}`));
                }
              }
              continue;
            }

            const { action } = await inquirer.prompt([
              {
                type: 'list',
                name: 'action',
                message: `如何处理标签 "${rawTag}"？`,
                choices
              }
            ]);

            if (action === 'create') {
              const nameEn = rawTag.replace(/\s+/g, '-').toLowerCase();
              try {
                const createResult = await apiClient.createSkillTag(rawTag, nameEn);
                if (createResult.code === 200 && createResult.data) {
                  resolvedTags.push(createResult.data.nameEn);
                  console.log(chalk.green(`  已创建: ${rawTag} -> ${createResult.data.nameEn}`));
                } else {
                  console.log(chalk.yellow(`  创建失败，跳过: ${rawTag}`));
                }
              } catch (createErr) {
                // Retry search (another process may have created it concurrently)
                try {
                  const retryResult = await apiClient.searchSkillTags(rawTag);
                  if (retryResult.code === 200 && Array.isArray(retryResult.data) && retryResult.data.length > 0) {
                    resolvedTags.push(retryResult.data[0].nameEn);
                    console.log(chalk.gray(`  已存在（重试命中）: ${rawTag} -> ${retryResult.data[0].nameEn}`));
                  } else {
                    console.log(chalk.yellow(`  创建失败，跳过: ${rawTag}`));
                  }
                } catch {
                  console.log(chalk.yellow(`  创建失败，跳过: ${rawTag}`));
                }
              }
            } else if (action === 'skip') {
              console.log(chalk.gray(`  已跳过: ${rawTag}`));
            } else {
              // Reuse existing tag
              resolvedTags.push(action);
              console.log(chalk.gray(`  复用: ${rawTag} -> ${action}`));
            }
          }
        }
      } else {
        // Fallback to original behavior
        console.log(chalk.yellow('批量解析失败，回退到逐个解析...'));
        for (const tag of tagsFinal) {
          try {
            const searchResult = await apiClient.searchSkillTags(tag);
            if (searchResult.code === 200 && Array.isArray(searchResult.data) && searchResult.data.length > 0) {
              resolvedTags.push(searchResult.data[0].nameEn);
            } else {
              resolvedTags.push(tag);
            }
          } catch {
            resolvedTags.push(tag);
          }
        }
      }
    } catch (err) {
      // Fallback: network error or endpoint not available
      console.log(chalk.yellow('批量解析接口不可用，回退到逐个解析...'));
      for (const tag of tagsFinal) {
        try {
          const searchResult = await apiClient.searchSkillTags(tag);
          if (searchResult.code === 200 && Array.isArray(searchResult.data) && searchResult.data.length > 0) {
            resolvedTags.push(searchResult.data[0].nameEn);
          } else {
            resolvedTags.push(tag);
          }
        } catch {
          resolvedTags.push(tag);
        }
      }
    }

    const data = {
      name: String(name).trim(),
      purpose: String(description).trim(),
      rootUrl: String(rootUrl).trim(),
      tags: resolvedTags,
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
