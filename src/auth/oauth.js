const http = require('http');
const chalk = require('chalk');
const open = require('open');
const axios = require('axios');
const { saveToken, getServerConfig } = require('./token-store');

const CLIENT_ID = 'skill-market-cli';

function getApiRoot() {
  const serverConfig = getServerConfig();
  return serverConfig.apiBase || `${serverConfig.baseURL}/api`;
}

async function getOAuthConfig() {
  const serverConfig = getServerConfig();
  const apiRoot = getApiRoot();

  try {
    const response = await axios.get(`${apiRoot}/oauth/config`);
    if (response.data && response.data.code === 200) {
      const data = response.data.data || {};
      return {
        ...data,
        authorizeURL: `${serverConfig.baseURL}/oauth/authorize`,
        tokenURL: `${apiRoot}/oauth/token`,
        userinfoURL: `${apiRoot}/oauth/userinfo`
      };
    }
  } catch (e) {
    // 使用下方默认配置
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

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function startCallbackServer(expectedState) {
  let resolveCode;
  let rejectCode;

  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    let pathname;
    let code;
    let state;
    let error;
    let error_description;
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const u = new URL(req.url || '/', base);
      pathname = u.pathname;
      code = u.searchParams.get('code');
      state = u.searchParams.get('state');
      error = u.searchParams.get('error');
      error_description = u.searchParams.get('error_description');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
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
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权未通过</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;">
<h1>授权未通过</h1><p>${escapeHtml(error_description) || escapeHtml(error)}</p><p>请关闭此窗口，回到终端继续操作。</p>
</body></html>`);
      server.close();
      rejectCode(new Error(error_description || error));
      return;
    }

    if (code) {
      if (expectedState && state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权失败</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;">
<h1>授权失败</h1><p>state 验证失败，可能存在 CSRF 攻击风险。</p><p>请关闭此窗口，回到终端重新登录。</p>
</body></html>`);
        server.close();
        rejectCode(new Error('OAuth state mismatch'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权完成</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px;">
<h1>授权完成</h1><p>本窗口可关闭，请回到终端查看登录结果。</p>
</body></html>`);
      server.close();
      resolveCode(code);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const actualPort = server.address().port;
      console.log(chalk.gray(`本地回调服务已启动，端口：${actualPort}`));
      resolve({ port: actualPort, codePromise });
    });

    server.on('error', reject);
  });
}

function formatApiError(err) {
  const d = err.response && err.response.data;
  if (!d) return err.message || String(err);
  if (typeof d === 'string') return d;
  if (d.error_description) return d.error_description;
  if (d.error) return d.error;
  try {
    return JSON.stringify(d);
  } catch {
    return err.message;
  }
}

async function login(options = {}) {
  const serverConfig = getServerConfig();

  console.log(chalk.bold('Skill Market 登录'));
  console.log(chalk.gray(`站点地址：${serverConfig.baseURL}`));

  const oauthConfig = await getOAuthConfig();

  const state = generateRandomString(16);
  const { port, codePromise } = await startCallbackServer(state);
  const redirectUri = `http://localhost:${port}/callback`;
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

  console.log('');
  console.log('请在浏览器中完成授权（将自动打开页面；若未打开，请复制下方链接到浏览器）：');
  console.log(chalk.cyan(authUrl.toString()));
  console.log('');

  if (options.open !== false) {
    try {
      await open(authUrl.toString());
      console.log(chalk.gray('已尝试打开系统默认浏览器。'));
    } catch (e) {
      console.log(chalk.yellow('无法自动打开浏览器，请手动访问上方链接。'));
    }
  }

  try {
    const code = await codePromise;
    console.log(chalk.gray('已收到授权码，正在换取访问令牌…'));

    const tokenURL = oauthConfig.tokenURL;
    const tokenResponse = await axios.post(
      tokenURL,
      {
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: oauthConfig.clientId,
        client_secret: 'dummy-secret'
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

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

    console.log('');
    console.log(chalk.green('登录成功'));
    console.log(chalk.gray(`当前用户：${user.name || user.sub || '（未返回名称）'}`));
    console.log('');

    return true;
  } catch (error) {
    console.log('');
    console.log(chalk.red('登录失败'));
    console.log(chalk.red(formatApiError(error)));
    if (error.response && error.response.data && process.env.DEBUG) {
      console.log(chalk.gray(JSON.stringify(error.response.data, null, 2)));
    }
    console.log('');
    return false;
  }
}

async function refreshAccessToken() {
  const { refreshToken } = require('./token-store').getToken();
  if (!refreshToken) {
    throw new Error('无刷新令牌，请重新登录');
  }

  const oauthConfig = await getOAuthConfig();
  const tokenURL = oauthConfig.tokenURL;

  try {
    const response = await axios.post(
      tokenURL,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: oauthConfig.clientId,
        client_secret: 'dummy-secret'
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = Date.now() + (expires_in * 1000);

    const { user } = require('./token-store').getToken();
    saveToken(access_token, refresh_token, expiresAt, user);

    return access_token;
  } catch (error) {
    throw new Error('刷新令牌失败：' + formatApiError(error));
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
