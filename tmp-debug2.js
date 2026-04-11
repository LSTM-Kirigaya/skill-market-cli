const axios = require('axios');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const skillDir = 'C:\\Users\\li\\Desktop\\Skill-Store-Release\\npm-publish';
const skillContent = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

const { parseSkillMarkdown, loadDotSkillExamples } = require('./src/lib/skill-upload-helpers');

const { frontmatter, examples: examplesFromMd } = parseSkillMarkdown(skillContent);
const fromJson = loadDotSkillExamples(skillDir);

console.log('Frontmatter:', frontmatter);
console.log('fromJson count:', fromJson ? fromJson.length : 0);

let name = frontmatter?.name;
let description = frontmatter?.purpose || frontmatter?.description;
let tags = frontmatter?.tags || [];
let model = frontmatter?.model;
let rootUrl = frontmatter?.rootUrl;

console.log('name:', JSON.stringify(name));
console.log('description:', JSON.stringify(description));
console.log('tags:', tags);
console.log('model:', model);
console.log('rootUrl:', rootUrl);

const config = require('./src/auth/token-store');
const pat = config.getPersonalAccessToken();

const data = {
  name: String(name).trim(),
  purpose: String(description).trim(),
  rootUrl: String(rootUrl).trim(),
  tags: tags.map(t => String(t).trim()).filter(Boolean),
  usageExamples: fromJson,
  model: String(model).trim()
};

console.log('Final data:', JSON.stringify(data, null, 2));

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
