const http = require('http');
const url = require('url');
const chalk = require('chalk');
const open = require('open');
const axios = require('axios');
const { saveToken, getServerConfig, setServerConfig } = require('./token-store');

const DEFAULT_SERVER_URL = 'https://kirigaya.cn';
const CLIENT_ID = 'skill-market-cli';

// 获取 OAuth 配置
async function getOAuthConfig() {
  try {
    const serverConfig = getServerConfig();
    const response = await axios.get(`${serverConfig.baseURL}/oauth/config`);
    if (response.data && response.data.code === 200) {
      return response.data.data;
    }
  } catch (e) {
    // 使用默认配置
  }
  return {
    clientId: CLIENT_ID,
    redirectUri: 'http://localhost:0/callback',
    authorizeURL: `${DEFAULT_SERVER_URL}/oauth/authorize`,
    tokenURL: `${DEFAULT_SERVER_URL}/oauth/token`,
    scopes: ['skill:read', 'skill:write', 'user:read']
  };
}

// 启动本地回调服务器
function startCallbackServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const { code, error, error_description } = parsedUrl.query;

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
        reject(new Error(error_description || error));
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
        resolve(code);
      }
    });

    server.listen(port, () => {
      const actualPort = server.address().port;
      console.log(chalk.gray(`Callback server listening on port ${actualPort}`));
    });

    server.on('error', reject);
  });
}

// 执行 OAuth 登录流程
async function login(options = {}) {
  console.log(chalk.blue('🔐 Starting OAuth login flow...\n'));

  // 获取 OAuth 配置
  const oauthConfig = await getOAuthConfig();
  console.log(chalk.gray(`Server: ${oauthConfig.authorizeURL}`));

  // 启动本地回调服务器
  let callbackPort = 0;
  const callbackPromise = startCallbackServer(callbackPort);

  // 构造授权 URL
  const state = generateRandomString(16);
  const redirectUri = `http://localhost:${callbackPort}/callback`;
  
  const authUrl = new URL(oauthConfig.authorizeURL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', oauthConfig.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', oauthConfig.scopes.join(' '));
  authUrl.searchParams.set('state', state);

  console.log(chalk.cyan('\n📱 Please authorize the CLI in your browser.\n'));
  console.log(chalk.gray('Authorization URL:'));
  console.log(chalk.underline(authUrl.toString()));
  console.log();

  // 自动打开浏览器
  if (options.open !== false) {
    try {
      await open(authUrl.toString());
      console.log(chalk.gray('Browser opened automatically.\n'));
    } catch (e) {
      console.log(chalk.yellow('Could not open browser automatically.'));
      console.log(chalk.yellow('Please open the URL manually.\n'));
    }
  }

  // 等待回调
  try {
    const code = await callbackPromise;
    console.log(chalk.green('✅ Authorization code received'));

    // 交换 Token
    console.log(chalk.gray('Exchanging code for token...'));
    
    const tokenResponse = await axios.post(oauthConfig.tokenURL, {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: oauthConfig.clientId,
      client_secret: 'dummy-secret' // 实际使用时需要从安全的地方获取
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // 获取用户信息
    const userResponse = await axios.get(`${oauthConfig.authorizeURL.replace('/authorize', '/userinfo')}`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const user = userResponse.data;

    // 保存 Token
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

// 刷新 Token
async function refreshAccessToken() {
  const { refreshToken } = require('./token-store').getToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const oauthConfig = await getOAuthConfig();
  
  try {
    const response = await axios.post(oauthConfig.tokenURL, {
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

// 生成随机字符串
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
