const fs = require('fs-extra');
const path = require('path');
const YAML = require('yaml');

/**
 * 解析 SKILL.md：frontmatter + ## Usage Examples 下简单分块（仅 prompt 文本）
 */
function parseSkillMarkdown(content) {
  let frontmatter = null;
  let examples = [];

  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (frontmatterMatch) {
    try {
      frontmatter = YAML.parse(frontmatterMatch[1]);
    } catch {
      // ignore
    }
  }

  const examplesMatch = content.match(/## Usage Examples?\s*\n([\s\S]*?)(?=##|$)/i);
  if (examplesMatch) {
    const exampleText = examplesMatch[1];
    const exampleBlocks = exampleText.split(/\n\n+/).filter((b) => b.trim());
    examples = exampleBlocks.map((block) => {
      const lines = block.split('\n').filter((l) => l.trim());
      return { prompt: lines.join('\n') };
    });
  }

  return { frontmatter, examples };
}

/**
 * 读取 run-example 生成的 .skill-examples.json，转为接口所需 usageExamples
 */
function loadDotSkillExamples(skillDir) {
  const filePath = path.join(skillDir, '.skill-examples.json');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = fs.readJsonSync(filePath);
    if (!data || !Array.isArray(data.examples)) {
      return null;
    }
    return data.examples.map((ex) => ({
      prompt: ex.prompt,
      aiResponses: ex.aiResponses || [],
      model: ex.model || data.model || ''
    }));
  } catch {
    return null;
  }
}

/**
 * 将仅有 prompt 的条目补全为完整 UsageExample（可选采集轨迹）
 */
function promptOnlyExamples(examples) {
  if (!examples || !examples.length) {
    return [];
  }
  return examples
    .map((ex) => ({
      prompt: (ex.prompt || '').trim(),
      aiResponses: ex.aiResponses,
      model: ex.model
    }))
    .filter((ex) => ex.prompt);
}

module.exports = {
  parseSkillMarkdown,
  loadDotSkillExamples,
  promptOnlyExamples
};
