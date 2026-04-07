const http = require('http');
const chalk = require('chalk');
const open = require('open');
const axios = require('axios');
const { saveToken, getServerConfig } = require('./token-store');

const CLIENT_ID = 'skill-market-cli';

/** 与前端 devServer /api 代理一致，CLI 的 token、userinfo、config 均走 apiBase */
function getApiRoot() {
  const serverConfig = getServerConfig();
  return serverConfig.apiBase || `${serverConfig.baseURL}/api`;
}

// 获取 OAuth 配置（基于当前 getServerConfig，由全局 --mode 在 preAction 中应用）
async function getOAuthConfig() {
  const serverConfig = getServerConfig();
  const apiRoot = getApiRoot();

  try {
    const response = await axios.get(`${apiRoot}/oauth/config`);
    if (response.data && response.data.code === 200) {
      const data = response.data.data || {};
      return {
        ...data,
        // 浏览器打开授权页用站点根 URL；换 token 等必须用 apiBase（如 localhost:8080/api），否则会 POST 到无代理的 /oauth/token 导致 404
        authorizeURL: `${serverConfig.baseURL}/oauth/authorize`,
        tokenURL: `${apiRoot}/oauth/token`,
        userinfoURL: `${apiRoot}/oauth/userinfo`
      };
    }
  } catch (e) {
    // 使用默认配置
  }

  return {
    clientId: CLIENT_ID,
    redirectUri: 'http://localhost:0/callback',
    authorizeURL: `${serverConfig.baseURL}/oauth/authorize`,
    tokenURL: `${apiRoot}/oauth/token`,
    userinfoURL: `${apiRoot}/oauth/userinfo`,
    scopes: ['skill:read', 'skill:write', 'user:read']
  };
}

/**
 * 启动本地回调服务，返回实际端口与收到 code 的 Promise
 */
function startCallbackServer() {
  let resolveCode;
  let rejectCode;

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    let pathname;
    let code;
    let error;
    let error_description;
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const u = new URL(req.url || '/', base);
      pathname = u.pathname;
      code = u.searchParams.get('code');
      error = u.searchParams.get('error');
      error_description = u.searchParams.get('error_description');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }

    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>授权失败</title></head>
        <body style="text-align:center;padding:50px;font-family:sans-serif;">
          <h1 style="color:#f44336;">❌ 授权失败</h1>
          <p>${error_description || error}</p>
          <p>请关闭此窗口并返回命令行</p>
        </body>
        </html>
      `);
      server.close();
      rejectCode(new Error(error_description || error));
      return;
    }

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>授权成功</title></head>
        <body style="text-align:center;padding:50px;font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);">
          <div style="background:white;padding:40px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);display:inline-block;">
            <div style="font-size:64px;color:#4CAF50;">✓</div>
            <h1 style="color:#333;">授权成功</h1>
            <p style="color:#666;">您已成功授权 Skill Market CLI</p>
            <p style="color:#999;font-size:14px;">请关闭此窗口并返回命令行</p>
          </div>
        </body>
        </html>
      `);
      server.close();
      resolveCode(code);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.listen(0, () => {
      const actualPort = server.address().port;
      console.log(chalk.gray(`Callback server listening on port ${actualPort}`));
      resolve({ port: actualPort, codePromise });
    });

    server.on('error', reject);
  });
}

// 执行 OAuth 登录流程
async function login(options = {}) {
  const serverConfig = getServerConfig();

  console.log(chalk.blue('🔐 Starting OAuth login flow...\n'));
  console.log(chalk.gray(`Server base: ${serverConfig.baseURL}`));

  const oauthConfig = await getOAuthConfig();
  console.log(chalk.gray(`Authorize: ${oauthConfig.authorizeURL || `${serverConfig.baseURL}/oauth/authorize`}`));

  const { port, codePromise } = await startCallbackServer();
  const redirectUri = `http://localhost:${port}/callback`;

  const state = generateRandomString(16);
  const authorizeURL = oauthConfig.authorizeURL || `${serverConfig.baseURL}/oauth/authorize`;
  const authUrl = new URL(authorizeURL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', oauthConfig.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  const scopeVal = oauthConfig.scopes;
  const scopeStr = Array.isArray(scopeVal)
    ? scopeVal.join(' ')
    : (scopeVal || 'skill:read skill:write user:read');
  authUrl.searchParams.set('scope', scopeStr);
  authUrl.searchParams.set('state', state);

  console.log(chalk.cyan('\n📱 Please authorize the CLI in your browser.\n'));
  console.log(chalk.gray('Authorization URL:'));
  console.log(chalk.underline(authUrl.toString()));
  console.log();

  if (options.open !== false) {
    try {
      await open(authUrl.toString());
      console.log(chalk.gray('Browser opened automatically.\n'));
    } catch (e) {
      console.log(chalk.yellow('Could not open browser automatically.'));
      console.log(chalk.yellow('Please open the URL manually.\n'));
    }
  }

  try {
    const code = await codePromise;
    console.log(chalk.green('✅ Authorization code received'));

    const tokenURL = oauthConfig.tokenURL;
    console.log(chalk.gray('Exchanging code for token...'));
    console.log(chalk.gray(`POST ${tokenURL}`));

    const tokenResponse = await axios.post(tokenURL, {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: oauthConfig.clientId,
      client_secret: 'dummy-secret'
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const userinfoURL = oauthConfig.userinfoURL;
    const userResponse = await axios.get(userinfoURL, {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    const user = userResponse.data;

    const expiresAt = Date.now() + (expires_in * 1000);
    saveToken(access_token, refresh_token, expiresAt, {
      name: user.name,
      email: user.email,
      picture: user.picture
    });

    console.log();
    console.log(chalk.green('✅ Login successful!'));
    console.log(chalk.cyan(`👤 Welcome, ${user.name}!`));
    console.log();

    return true;
  } catch (error) {
    console.error();
    console.error(chalk.red('❌ Login failed:'), error.message);
    if (error.response) {
      console.error(chalk.red('Server response:'), error.response.data);
    }
    return false;
  }
}

async function refreshAccessToken() {
  const { refreshToken } = require('./token-store').getToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const oauthConfig = await getOAuthConfig();
  const tokenURL = oauthConfig.tokenURL;

  try {
    const response = await axios.post(tokenURL, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: oauthConfig.clientId,
      client_secret: 'dummy-secret'
    });

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = Date.now() + (expires_in * 1000);

    const { user } = require('./token-store').getToken();
    saveToken(access_token, refresh_token, expiresAt, user);

    return access_token;
  } catch (error) {
    throw new Error('Failed to refresh token: ' + error.message);
  }
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = {
  login,
  refreshAccessToken,
  getOAuthConfig
};
