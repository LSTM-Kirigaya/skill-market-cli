const axios = require('axios');
const fs = require('fs');
const path = require('path');

const skillDir = 'C:\\Users\\li\\Desktop\\Skill-Store-Release\\npm-publish';
const skillContent = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

const frontmatter = {};
const fmMatch = skillContent.match(/^---\n([\s\S]*?)\n---/);
if (fmMatch) {
  const yaml = require('yaml');
  Object.assign(frontmatter, yaml.parse(fmMatch[1]));
}

const examplesJson = JSON.parse(fs.readFileSync(path.join(skillDir, '.skill-examples.json'), 'utf-8'));

const data = {
  name: frontmatter.name,
  purpose: frontmatter.purpose || frontmatter.description,
  rootUrl: frontmatter.rootUrl || 'file:///C:/Users/li/Desktop/Skill-Store-Release/npm-publish/SKILL.md',
  tags: frontmatter.tags || ['npm', 'publish', 'package', 'release'],
  usageExamples: examplesJson.examples.map(e => ({
    prompt: e.prompt,
    aiResponses: e.aiResponses,
    model: e.model || frontmatter.model
  })),
  model: frontmatter.model || 'claude-3-5-sonnet'
};

const config = require('./src/auth/token-store');
const pat = config.getPersonalAccessToken();

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
