const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();

// Token 持久化文件路径
const TOKEN_FILE = path.join(__dirname, '.token.json');

// 从文件加载 token
function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
      // 检查是否过期
      if (!data.expiresAt || Date.now() < data.expiresAt) {
        console.log('[Auth] 从文件加载 Token 成功');
        return data;
      }
      console.log('[Auth] 文件中的 Token 已过期');
    }
  } catch (e) {
    console.warn('[Auth] 加载 Token 文件失败：', e.message);
  }
  return { accessToken: null, tokenType: null, expiresAt: null };
}

// 保存 token 到文件
function saveToken(store) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(store), 'utf-8');
  } catch (e) {
    console.warn('[Auth] 保存 Token 文件失败：', e.message);
  }
}

// 初始化 tokenStore（优先从文件读取）
let tokenStore = loadToken();

// ─── 静态文件服务 ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── 路由一：发起 OAuth 授权 ──────────────────────────────────
app.get('/auth', (req, res) => {
  const params = new URLSearchParams({
    client_id: config.CLIENT_ID,
    redirect_uri: config.REDIRECT_URI,
    response_type: 'code',
    scope: config.SCOPE
  });
  const authUrl = `${config.OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  res.redirect(authUrl);
});

// ─── 路由二：OAuth 回调，换取 Access Token ────────────────────
app.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect('/?auth=error&msg=' + encodeURIComponent(error));
  }

  if (!code) {
    return res.redirect('/?auth=error&msg=no_code');
  }

  try {
    const credentials = Buffer.from(`${config.CLIENT_ID}:${config.CLIENT_SECRET}`).toString('base64');

    const response = await axios.post(
      config.OAUTH_TOKEN_URL,
      new URLSearchParams({
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: config.REDIRECT_URI
      }).toString(),
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, token_type, expires_in } = response.data;

    tokenStore.accessToken = access_token;
    tokenStore.tokenType = token_type || 'Bearer';
    tokenStore.expiresAt = expires_in
      ? Date.now() + expires_in * 1000
      : null;

    saveToken(tokenStore);
    console.log('[Auth] 授权成功，Access Token 已保存');
    res.redirect('/?auth=success');
  } catch (err) {
    console.error('[Auth] 换取 Token 失败：', err.response?.data || err.message);
    res.redirect('/?auth=error&msg=' + encodeURIComponent('token_exchange_failed'));
  }
});

// ─── 路由三：检查授权状态 ──────────────────────────────────────
app.get('/api/status', (req, res) => {
  const isAuthorized = !!tokenStore.accessToken;
  const isExpired = tokenStore.expiresAt
    ? Date.now() > tokenStore.expiresAt
    : false;

  res.json({
    authorized: isAuthorized && !isExpired,
    expiresAt: tokenStore.expiresAt
  });
});

// ─── 路由四：获取所有清单 ─────────────────────────────────────
app.get('/api/projects', async (req, res) => {
  if (!tokenStore.accessToken) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  try {
    const response = await axios.get(`${config.API_BASE_URL}/project`, {
      headers: {
        'Authorization': `${tokenStore.tokenType} ${tokenStore.accessToken}`
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('[API] 获取清单失败：', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: '获取清单失败',
      detail: err.response?.data || err.message
    });
  }
});

// ─── 路由五：获取指定清单下的任务 ─────────────────────────────
app.get('/api/project/:projectId/tasks', async (req, res) => {
  if (!tokenStore.accessToken) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  const { projectId } = req.params;

  try {
    const response = await axios.get(
      `${config.API_BASE_URL}/project/${projectId}/data`,
      {
        headers: {
          'Authorization': `${tokenStore.tokenType} ${tokenStore.accessToken}`
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    console.error(`[API] 获取清单 ${projectId} 任务失败：`, err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: '获取任务失败',
      detail: err.response?.data || err.message
    });
  }
});

// ─── 路由六：获取所有任务（聚合所有清单） ─────────────────────
app.get('/api/tasks/all', async (req, res) => {
  if (!tokenStore.accessToken) {
    return res.status(401).json({ error: '未授权，请先登录' });
  }

  const headers = {
    'Authorization': `${tokenStore.tokenType} ${tokenStore.accessToken}`
  };

  try {
    // 1. 获取所有清单
    const projectsRes = await axios.get(`${config.API_BASE_URL}/project`, { headers });
    const projects = projectsRes.data;

    // 2. 并发获取每个清单的任务（Open API 仅支持返回未完成任务）
    const taskPromises = projects.map(project =>
      axios.get(`${config.API_BASE_URL}/project/${project.id}/data`, { headers })
        .then(r => ({ project, tasks: r.data.tasks || [] }))
        .catch(() => ({ project, tasks: [] }))
    );

    const results = await Promise.all(taskPromises);

    // 3. 将清单信息注入每条任务并聚合
    const allTasks = [];
    results.forEach(({ project, tasks }) => {
      tasks.forEach(task => {
        allTasks.push({
          ...task,
          projectName: project.name,
          projectColor: project.color
        });
      });
    });

    console.log(`[API] 共获取 ${allTasks.length} 条任务`);
    res.json({ projects, tasks: allTasks });

  } catch (err) {
    console.error('[API] 获取全部任务失败：', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: '获取全部任务失败',
      detail: err.response?.data || err.message
    });
  }
});

// ─── 启动服务 ─────────────────────────────────────────────────
app.listen(config.PORT, () => {
  console.log(`\n🚀 滴答清单看板已启动`);
  console.log(`📌 访问地址：http://localhost:${config.PORT}`);
  console.log(`🔑 授权入口：http://localhost:${config.PORT}/auth\n`);
});
