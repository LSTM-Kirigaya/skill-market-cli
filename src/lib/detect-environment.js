const { execSync } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * 环境配置映射
 * 每个环境定义：检测用的环境变量、父进程名关键字、推荐模型、显示名称
 */
const ENV_CONFIG = {
  'claude-code': {
    envVars: ['CLAUDE_CODE'],
    parentProcessNames: ['claude', 'claude-code', 'claude.exe'],
    model: 'claude-sonnet',
    displayName: 'Claude Code'
  },
  'kimi-code': {
    envVars: ['KIMI_CODE'],
    parentProcessNames: ['kimi', 'kimi-code', 'kimi.exe'],
    model: 'kimi',
    displayName: 'Kimi Code'
  },
  'cursor': {
    envVars: ['CURSOR_TRACE_ID', 'CURSOR_ENV'],
    parentProcessNames: ['cursor', 'cursor.exe'],
    model: 'claude-sonnet',
    displayName: 'Cursor'
  },
  'vscode': {
    envVars: ['VSCODE_CWD'],
    envVarChecks: { TERM_PROGRAM: 'vscode' },
    parentProcessNames: ['code', 'code.exe', 'vscode'],
    model: 'deepseek-chat',
    displayName: 'VS Code'
  }
};

const FALLBACK_MODEL = 'claude-sonnet';

/**
 * 检测当前运行环境
 * 优先级：禁用开关 > 环境变量 > 父进程名 > 回退
 * @returns {{env: string|null, displayName: string, model: string}}
 */
function detectEnvironment() {
  // 全局禁用开关
  if (process.env.SMCLI_DISABLE_ENV_DETECT) {
    return { env: null, displayName: 'default', model: FALLBACK_MODEL };
  }

  // 1. 环境变量检测（最高优先级）
  for (const [envKey, config] of Object.entries(ENV_CONFIG)) {
    const hasExactEnv = config.envVars.some(varName => process.env[varName]);
    const hasCheckedEnv = config.envVarChecks
      ? Object.entries(config.envVarChecks).every(
          ([key, value]) => process.env[key] === value
        )
      : false;

    if (hasExactEnv || hasCheckedEnv) {
      return { env: envKey, displayName: config.displayName, model: config.model };
    }
  }

  // 2. 父进程名检测（辅助手段）
  const parentName = getParentProcessName();
  if (parentName) {
    for (const [envKey, config] of Object.entries(ENV_CONFIG)) {
      const normalizedParent = parentName.toLowerCase();
      const matches = config.parentProcessNames.some(
        name => normalizedParent.includes(name.toLowerCase())
      );
      if (matches) {
        return { env: envKey, displayName: config.displayName, model: config.model };
      }
    }
  }

  // 3. 未检测到
  return { env: null, displayName: 'default', model: FALLBACK_MODEL };
}

/**
 * 跨平台获取父进程名
 * @returns {string|null}
 */
function getParentProcessName() {
  const ppid = process.ppid;
  if (!ppid || ppid <= 1) return null;

  try {
    const platform = os.platform();

    if (platform === 'win32') {
      try {
        const output = execSync(
          `wmic process where "ProcessId=${ppid}" get Name /value`,
          { encoding: 'utf-8', timeout: 2000 }
        );
        const match = output.match(/Name=(.+?)(\r?\n|$)/i);
        if (match) return match[1].trim();
      } catch {
        try {
          const output = execSync(
            `powershell -NoProfile -Command "(Get-Process -Id ${ppid}).ProcessName"`,
            { encoding: 'utf-8', timeout: 2000 }
          );
          return output.trim() || null;
        } catch {
          return null;
        }
      }
    } else if (platform === 'darwin' || platform === 'linux') {
      try {
        const output = execSync(
          `ps -p ${ppid} -o comm=`,
          { encoding: 'utf-8', timeout: 2000 }
        );
        return output.trim() || null;
      } catch {
        return null;
      }
    }
  } catch {
    // 忽略所有错误，不影响主流程
  }

  return null;
}

/**
 * 获取推荐模型（带缓存，避免重复检测）
 * @returns {string}
 */
let _cachedEnv = null;
function getRecommendedModel() {
  if (!_cachedEnv) {
    _cachedEnv = detectEnvironment();
  }
  return _cachedEnv.model;
}

/**
 * 获取检测到的环境信息
 * @returns {{env: string|null, displayName: string, model: string}}
 */
function getDetectedEnv() {
  if (!_cachedEnv) {
    _cachedEnv = detectEnvironment();
  }
  return _cachedEnv;
}

/**
 * 生成 User-Agent 字符串
 * @returns {string}
 */
function getUserAgent() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    const { env, displayName } = getDetectedEnv();
    const platform = os.platform();
    const arch = os.arch();
    const nodeVersion = process.version;

    const envSegment = env ? `env:${env}` : 'env:unknown';

    return `skill-market-cli/${pkg.version} (${platform}; ${arch}; ${nodeVersion}; ${envSegment}; ${displayName})`;
  } catch {
    return 'skill-market-cli/unknown';
  }
}

/**
 * 清空缓存（主要用于测试）
 */
function clearEnvCache() {
  _cachedEnv = null;
}

module.exports = {
  detectEnvironment,
  getParentProcessName,
  getRecommendedModel,
  getDetectedEnv,
  getUserAgent,
  clearEnvCache,
  ENV_CONFIG,
  FALLBACK_MODEL
};
