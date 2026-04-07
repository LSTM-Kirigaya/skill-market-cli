const axios = require('axios');
const chalk = require('chalk');
const { getToken, isLoggedIn, getServerConfig } = require('../auth/token-store');
const { refreshAccessToken } = require('../auth/oauth');

class ApiClient {
  constructor() {
    this.client = null;
    this.init();
  }

  reinit() {
    this.init();
  }

  init() {
    const serverConfig = getServerConfig();
    this.client = axios.create({
      baseURL: serverConfig.apiBase,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 请求拦截器 - 添加 Token
    this.client.interceptors.request.use(
      async (config) => {
        if (isLoggedIn()) {
          const { accessToken, expiresAt } = getToken();
          
          // 检查 Token 是否即将过期
          if (expiresAt && Date.now() > expiresAt - 60000) {
            // Token 即将过期，尝试刷新
            try {
              const newToken = await refreshAccessToken();
              config.headers['Authorization'] = `Bearer ${newToken}`;
            } catch (e) {
              // 刷新失败，使用现有 Token
              config.headers['Authorization'] = `Bearer ${accessToken}`;
            }
          } else {
            config.headers['Authorization'] = `Bearer ${accessToken}`;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器 - 处理错误
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response) {
          // 401 未授权 - Token 可能已过期
          if (error.response.status === 401) {
            console.error(chalk.red('\n❌ Authentication expired. Please login again.'));
            console.error(chalk.gray('Run: skill-market-cli login\n'));
          }
          
          // 403 禁止访问
          if (error.response.status === 403) {
            console.error(chalk.red('\n❌ You do not have permission to perform this action.'));
          }

          // 429 请求过多
          if (error.response.status === 429) {
            console.error(chalk.yellow('\n⚠️  Too many requests. Please try again later.'));
          }
        } else if (error.request) {
          console.error(chalk.red('\n❌ Network error. Please check your connection.'));
        }
        return Promise.reject(error);
      }
    );
  }

  // Skills API
  async listSkills(page = 1, pageSize = 20) {
    const response = await this.client.get('/skill/list', {
      params: { page, pageSize }
    });
    return response.data;
  }

  async getMySkills() {
    // 获取当前用户的 skills
    const response = await this.client.get('/skill/list', {
      params: { page: 1, pageSize: 1000 }
    });
    
    const { user } = getToken();
    if (response.data && response.data.data && response.data.data.list) {
      response.data.data.list = response.data.data.list.filter(
        skill => skill.creator === user.name
      );
    }
    return response.data;
  }

  async getSkillDetail(id) {
    const response = await this.client.get(`/skill/detail/${id}`);
    return response.data;
  }

  async uploadSkill(data) {
    const response = await this.client.post('/skill/upload', data);
    return response.data;
  }

  async updateSkill(id, data) {
    const response = await this.client.post(`/skill/update/${id}`, data);
    return response.data;
  }

  async deleteSkill(id) {
    const response = await this.client.post(`/skill/delete/${id}`);
    return response.data;
  }

  // OAuth API
  async getUserInfo() {
    const serverConfig = getServerConfig();
    const { accessToken } = getToken();
    const response = await axios.get(`${serverConfig.baseURL}/oauth/userinfo`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    return response.data;
  }
}

// 导出单例
module.exports = new ApiClient();
