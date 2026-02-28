// 配置文件模板 - 复制此文件为 config.js 并填入你自己的信息
// 注意：仅在需要 OAuth API 功能时才需要此文件，纯 CSV 模式无需配置
module.exports = {
  CLIENT_ID: '你的_CLIENT_ID',
  CLIENT_SECRET: '你的_CLIENT_SECRET',
  REDIRECT_URI: 'http://localhost:3000/callback',
  PORT: 3000,

  // 滴答清单 OAuth 地址
  OAUTH_AUTHORIZE_URL: 'https://dida365.com/oauth/authorize',
  OAUTH_TOKEN_URL: 'https://dida365.com/oauth/token',

  // 滴答清单 API 基础地址
  API_BASE_URL: 'https://api.dida365.com/open/v1',

  // OAuth 权限范围
  SCOPE: 'tasks:read tasks:write'
};
