const axios = require('axios');
const fs = require('fs');
const path = require('path');

const skillDir = 'C:\\Users\\li\\Desktop\\Skill-Store-Release\\npm-publish';
const skillContent = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

const { parseSkillMarkdown, loadDotSkillExamples } = require('./src/lib/skill-upload-helpers');

const { frontmatter } = parseSkillMarkdown(skillContent);
const fromJson = loadDotSkillExamples(skillDir);

const config = require('./src/auth/token-store');
const pat = config.getPersonalAccessToken();

const data = {
  name: String(frontmatter.name).trim(),
  purpose: String(frontmatter.purpose || frontmatter.description).trim(),
  rootUrl: String(frontmatter.rootUrl).trim(),
  tags: frontmatter.tags.map(t => String(t).trim()).filter(Boolean),
  usageExamples: fromJson,
  model: String(frontmatter.model).trim()
};

axios.post('https://kirigaya.cn/api/skill/ai/upload', data, {
  headers: {
    'Authorization': 'Bearer ' + pat,
    'Content-Type': 'application/json'
  }
}).then(r => {
  console.log('Success:', JSON.stringify(r.data, null, 2));
}).catch(e => {
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  } else {
    console.error('Error:', e.message);
  }
});
