#!/usr/bin/env node
/**
 * 测试脚本：验证 skill-market-cli 的 upload 流程
 *
 * 测试点：
 * 1. POST /api/skill/tags/resolve 批量解析 —— 已有 tag 精确匹配，未知 tag 返回建议
 * 2. CLI upload 的 tag 解析流程 —— matched 直接使用，unmatched 交互/自动创建
 *
 * 用法：
 *   node test/test-upload.js                    # 运行全部测试
 *   node test/test-upload.js --resolve-only     # 仅测试 resolve API
 *   node test/test-upload.js --upload           # 测试完整上传（需交互或 --yes）
 */

const chalk = require('chalk');
const path = require('path');
const apiClient = require('../src/api/client');
const { parseSkillMarkdown } = require('../src/lib/skill-upload-helpers');
const fs = require('fs-extra');

// ─── 配置 ───────────────────────────────────────────────
const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'tencent-ses-service');
const SKILL_FILE = path.join(FIXTURE_DIR, 'SKILL.md');

// ─── 工具函数 ──────────────────────────────────────────
function logSection(title) {
  console.log('\n' + '='.repeat(60));
  console.log(chalk.bold(`  ${title}`));
  console.log('='.repeat(60));
}

function logOK(msg) {
  console.log(chalk.green(`  ✓ ${msg}`));
}

function logFAIL(msg) {
  console.log(chalk.red(`  ✗ ${msg}`));
}

function logInfo(msg) {
  console.log(chalk.gray(`  ℹ ${msg}`));
}

// ─── 测试 1：Tag 解析 API ──────────────────────────────
async function testResolveAPI() {
  logSection('测试 1：POST /api/skill/tags/resolve 批量标签解析');

  // 从 fixture 读取实际 tags
  const content = fs.readFileSync(SKILL_FILE, 'utf-8');
  const { frontmatter } = parseSkillMarkdown(content);
  const testTags = (frontmatter && frontmatter.tags) ? frontmatter.tags : [];

  // 额外加入一个确定不存在且无建议的 tag
  const uniqueTag = 'zzz-unique-test-' + Date.now();
  testTags.push(uniqueTag);

  console.log(chalk.gray(`  输入标签: ${testTags.join(', ')}`));

  let result;
  try {
    result = await apiClient.resolveSkillTags(testTags);
  } catch (err) {
    logFAIL(`API 调用失败: ${err.message}`);
    return { passed: 0, failed: 1 };
  }

  if (result.code !== 200) {
    logFAIL(`API 返回非 200: ${JSON.stringify(result)}`);
    return { passed: 0, failed: 1 };
  }

  const data = result.data;
  let passed = 0;
  let failed = 0;
  let matchedCount = 0;
  let unmatchedCount = 0;

  // 遍历所有返回结果，验证数据结构
  for (const [rawTag, info] of Object.entries(data)) {
    if (info.status === 'matched') {
      if (info.tag && info.tag.nameEn && info.tag.nameZh) {
        logOK(`"${rawTag}" → matched: ${info.tag.nameZh} (${info.tag.nameEn})`);
        matchedCount++;
      } else {
        logFAIL(`"${rawTag}" status=matched 但缺少 tag 详情`);
        failed++;
      }
    } else if (info.status === 'unmatched') {
      const suggestions = info.suggestions || [];
      if (suggestions.length > 0) {
        logOK(`"${rawTag}" → unmatched，${suggestions.length} 条建议: ${suggestions.map(s => s.nameZh).join(', ')}`);
      } else {
        logOK(`"${rawTag}" → unmatched，无相似建议`);
      }
      unmatchedCount++;
    } else {
      logFAIL(`"${rawTag}" 未知状态: ${info.status}`);
      failed++;
    }
  }

  // 验证唯一 tag 必然是 unmatched
  const uniqueKey = Object.keys(data).find(k => k === uniqueTag);
  if (uniqueKey && data[uniqueKey].status === 'unmatched') {
    logOK(`唯一测试 tag "${uniqueTag}" 正确返回 unmatched`);
    passed++;
  } else {
    logFAIL(`唯一测试 tag "${uniqueTag}" 应 unmatched`);
    failed++;
  }

  passed += matchedCount + unmatchedCount; // 每个返回都算通过
  logInfo(`统计: ${matchedCount} 匹配, ${unmatchedCount} 未匹配`);

  console.log(chalk.bold(`\n  结果: ${chalk.green(passed + ' 通过')} / ${chalk.red(failed + ' 失败')}`));
  return { passed, failed, data };
}

// ─── 测试 2：SKILL.md 解析 ─────────────────────────────
async function testParseSkillMD() {
  logSection('测试 2：SKILL.md 解析（frontmatter + Usage Examples）');

  if (!fs.existsSync(SKILL_FILE)) {
    logFAIL(`SKILL.md 不存在: ${SKILL_FILE}`);
    return { passed: 0, failed: 1 };
  }

  const content = fs.readFileSync(SKILL_FILE, 'utf-8');
  const { frontmatter, examples } = parseSkillMarkdown(content);

  let passed = 0;
  let failed = 0;

  if (frontmatter) {
    logOK(`frontmatter 解析成功`);
    logInfo(`  name: ${frontmatter.name}`);
    logInfo(`  purpose: ${(frontmatter.purpose || '').substring(0, 50)}...`);
    logInfo(`  tags: [${(frontmatter.tags || []).join(', ')}]`);
    logInfo(`  model: ${frontmatter.model}`);
    logInfo(`  rootUrl: ${frontmatter.rootUrl}`);
    passed++;
  } else {
    logFAIL('frontmatter 解析失败');
    failed++;
  }

  if (examples.length > 0) {
    logOK(`解析到 ${examples.length} 条 Usage Example`);
    passed++;
  } else {
    logFAIL('未解析到 Usage Example');
    failed++;
  }

  console.log(chalk.bold(`\n  结果: ${chalk.green(passed + ' 通过')} / ${chalk.red(failed + ' 失败')}`));
  return { passed, failed, frontmatter, examples };
}

// ─── 测试 3：模拟 CLI upload 的 tag 解析流程 ─────────────
async function testTagResolutionFlow() {
  logSection('测试 3：模拟 CLI upload 中的 tag 解析流程');

  const content = fs.readFileSync(SKILL_FILE, 'utf-8');
  const { frontmatter } = parseSkillMarkdown(content);
  const tagsFromMD = frontmatter.tags || [];

  console.log(chalk.gray(`  从 SKILL.md 解析到的 tags: [${tagsFromMD.join(', ')}]`));

  // Step 1: 批量 resolve
  let resolveResult;
  try {
    resolveResult = await apiClient.resolveSkillTags(tagsFromMD);
  } catch (err) {
    logFAIL(`批量解析失败: ${err.message}`);
    return { passed: 0, failed: 1 };
  }

  if (resolveResult.code !== 200) {
    logFAIL(`批量解析返回非 200`);
    return { passed: 0, failed: 1 };
  }

  const data = resolveResult.data;
  const matched = [];
  const unmatched = [];
  let passed = 0;
  let failed = 0;

  for (const [rawTag, result] of Object.entries(data)) {
    if (result.status === 'matched' && result.tag) {
      matched.push({ raw: rawTag, nameEn: result.tag.nameEn, nameZh: result.tag.nameZh });
      logOK(`"${rawTag}" → 匹配到 "${result.tag.nameZh}" (${result.tag.nameEn})`);
    } else {
      const suggestions = result.suggestions || [];
      unmatched.push({ raw: rawTag, suggestions });
      if (suggestions.length > 0) {
        logInfo(`"${rawTag}" → 未匹配，有 ${suggestions.length} 条建议`);
      } else {
        logInfo(`"${rawTag}" → 未匹配，无建议`);
      }
    }
  }

  // 验证：所有返回的 tag 状态均合法
  for (const [rawTag, info] of Object.entries(data)) {
    if (info.status === 'matched' && info.tag) {
      passed++;
    } else if (info.status === 'unmatched') {
      passed++;
    } else {
      logFAIL(`"${rawTag}" 状态异常: ${info.status}`);
      failed++;
    }
  }

  logInfo(`resolve 结果: ${matched.length} 匹配, ${unmatched.length} 未匹配`);

  // 模拟 --yes 自动模式：matched 直接用，unmatched 自动创建
  logInfo('\n  模拟 --yes 自动模式:');
  const resolvedTags = matched.map(m => m.nameEn);

  for (const u of unmatched) {
    if (u.suggestions.length > 0) {
      // 有建议则取第一个
      const pick = u.suggestions[0].nameEn;
      resolvedTags.push(pick);
      logInfo(`  [auto] "${u.raw}" → 复用建议: ${pick}`);
    } else {
      // 无建议则尝试创建
      const nameEn = u.raw.replace(/\s+/g, '-').toLowerCase();
      try {
        const createResult = await apiClient.createSkillTag(u.raw, nameEn);
        if (createResult.code === 200 && createResult.data) {
          resolvedTags.push(createResult.data.nameEn);
          logOK(`  [auto] "${u.raw}" → 已创建: ${createResult.data.nameEn}`);
          passed++;
        } else {
          logFAIL(`  [auto] "${u.raw}" → 创建失败: ${JSON.stringify(createResult)}`);
          failed++;
        }
      } catch (err) {
        logFAIL(`  [auto] "${u.raw}" → 创建异常: ${err.message}`);
        failed++;
      }
    }
  }

  console.log(chalk.gray(`\n  最终提交的 tags: [${resolvedTags.join(', ')}]`));

  console.log(chalk.bold(`\n  结果: ${chalk.green(passed + ' 通过')} / ${chalk.red(failed + ' 失败')}`));
  return { passed, failed, matched, unmatched, resolvedTags };
}

// ─── 主入口 ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const resolveOnly = args.includes('--resolve-only');
  const upload = args.includes('--upload');

  console.log(chalk.bold.cyan('╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║   Skill Market CLI — Upload 流程测试                  ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════╝'));
  console.log(chalk.gray(`  测试 fixture: ${SKILL_FILE}`));

  let totalPassed = 0;
  let totalFailed = 0;

  // 测试 1: Resolve API
  if (!upload) {
    const r1 = await testResolveAPI();
    totalPassed += r1.passed;
    totalFailed += r1.failed;
  }

  // 测试 2: SKILL.md 解析
  if (!upload) {
    const r2 = await testParseSkillMD();
    totalPassed += r2.passed;
    totalFailed += r2.failed;
  }

  // 测试 3: Tag 解析流程模拟
  const r3 = await testTagResolutionFlow();
  totalPassed += r3.passed;
  totalFailed += r3.failed;

  // 如果有 --upload，实际执行 CLI upload
  if (upload) {
    logSection('测试 4：实际 CLI Upload（--yes 非交互模式）');
    const { execSync } = require('child_process');
    try {
      const cmd = `node bin/skill-market-cli.js upload "${FIXTURE_DIR}" --yes`;
      logInfo(`执行: ${cmd}`);
      const output = execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf-8', timeout: 60000 });
      console.log(output);
      logOK('Upload 命令执行成功');
      totalPassed++;
    } catch (err) {
      logFAIL(`Upload 命令执行失败: ${err.message}`);
      if (err.stdout) console.log(chalk.gray(err.stdout.toString()));
      if (err.stderr) console.log(chalk.red(err.stderr.toString()));
      totalFailed++;
    }
  }

  // ─── 总结 ──────────────────────────────────────────
  logSection('测试总结');
  const total = totalPassed + totalFailed;
  if (totalFailed === 0) {
    console.log(chalk.green.bold(`  ✓ 全部 ${total} 项测试通过`));
  } else {
    console.log(chalk.yellow.bold(`  ${totalPassed}/${total} 通过, ${totalFailed} 失败`));
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(chalk.red('测试脚本异常:'), err);
  process.exit(1);
});
