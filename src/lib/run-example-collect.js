const chalk = require('chalk');

/**
 * 对用户 prompt 执行一次「示例运行」，采集 AI 侧轨迹（thinking / toolcall / message）。
 * 生产环境可替换为真实模型 API；当前为可预测的模拟数据，便于联调。
 */
async function runExampleAndCollect(prompt, model) {
  const modelLabel = model && String(model).trim() ? String(model).trim() : 'default';

  console.log(chalk.gray('\n正在运行用户案例以采集轨迹与输出…'));
  console.log(chalk.gray(`推荐模型：${modelLabel}`));

  const simulatedResponses = [
    {
      type: 'thinking',
      content: `分析用户请求：「${prompt}」。将拆解步骤并调用合适工具完成目标。`
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
        content: `已处理：${prompt}`
      }
    },
    {
      type: 'message',
      content: `已根据你的请求完成处理：「${prompt}」。\n\n步骤摘要：\n1. 理解需求\n2. 读取上下文\n3. 生成结果\n\n以上为演示轨迹，上传时将一并提交。`
    }
  ];

  await new Promise((resolve) => setTimeout(resolve, 400));

  console.log(chalk.gray(`已采集 ${simulatedResponses.length} 条轨迹节点（thinking / toolcall / message）。`));

  return simulatedResponses;
}

module.exports = { runExampleAndCollect };
