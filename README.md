# ✅ 滴答清单数据看板 (TickTick Dashboard)

基于滴答清单（TickTick / Dida365）备份 CSV 文件的**本地时间统计看板**。  
导入 CSV 即可查看任务的时间分布、清单占比和趋势分析，**无需联网**，数据完全本地。

<img width="2158" height="1022" alt="看板Preview" src="https://github.com/user-attachments/assets/f8ac4bcc-715b-4514-8ef3-7b627bbbfd57" />

---

## ✨ 功能特性

- 📂 **CSV 导入** — 从 dida365.com 导出备份 CSV，一键导入
- 📊 **多维度图表** — 文件夹饼图 + 清单饼图 + 时间趋势柱状图（ECharts）
- 📅 **时间筛选** — 日 / 周 / 月 / 季度 / 年，支持日期选择器快速跳转
- 🏷️ **清单 & 标签筛选** — 按文件夹分组的清单按钮 + 按频率排序的标签按钮
- 📋 **任务表格** — 完整的任务列表，含时长、优先级、完成状态
- 💾 **本地持久化** — 数据缓存在浏览器 localStorage，刷新不丢失
- 🎨 **自定义颜色** — 清单和文件夹独立配色，支持 Emoji 清单名

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/你的用户名/DidaTaskManager.git
cd DidaTaskManager
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置（可选）

仅在需要 OAuth API 功能时才需要配置。**纯 CSV 模式无需任何配置**。

```bash
cp config.example.js config.js
# 编辑 config.js 填入你的 OAuth 信息
```

### 4. 启动

```bash
npm start
```

访问 [http://localhost:3000](http://localhost:3000) 即可。

### 5. 导入数据

1. 登录 [dida365.com](https://dida365.com)
2. 左上角头像 → 设置 → 账户 → 数据备份 → 生成备份 → 下载 `.csv`
3. 在看板页面点击右上角 **📂 导入 CSV**，选择下载的文件

---

## 📁 项目结构

```
DidaTaskManager/
├── server.js           # Express 静态文件服务器
├── config.example.js   # 配置模板（OAuth，可选）
├── package.json
├── public/
│   ├── index.html      # 页面结构
│   ├── style.css       # 样式
│   └── app.js          # 前端核心逻辑（CSV 解析、图表、筛选）
└── 00.demand.txt       # 需求文档
```

---

## 🎨 自定义清单结构

项目默认配置了一套清单/文件夹结构。你可以在 `public/app.js` 顶部修改以下常量来适配自己的滴答清单配置：

```javascript
// 清单 → 文件夹 映射
const FOLDER_MAP = {
  '文献':    '学术研究',
  '实验':    '学术研究',
  '工作':    '工作事务',
  // ... 添加你的清单映射
};

// 清单颜色
const PROJECT_COLORS = {
  '文献':    '#22c55e',
  '实验':    '#EA3F4A',
  // ... 添加你的颜色
};

// 文件夹颜色
const FOLDER_COLORS = {
  '学术研究': '#dc2626',
  '工作事务': '#1d4ed8',
  // ... 添加你的文件夹颜色
};
```

> 💡 清单名称如果带有 Emoji 前缀（如 `📄文献`），系统会自动去除 Emoji 后匹配颜色配置。

---

## 📐 时间统计规则

| 规则 | 说明 |
|------|------|
| 统计对象 | 非全天、有开始时间和结束时间的任务 |
| 时长计算 | `结束时间 - 开始时间`，精确到分钟 |
| 时间归属 | 优先使用 `开始时间` 判定属于哪一天 |
| 全天任务 | 标注为「全天」，不计入时长统计 |

---

## 🛠️ 技术栈

- **后端**：Node.js + Express（仅作静态文件托管）
- **前端**：原生 HTML + CSS + JavaScript（无框架）
- **图表**：[ECharts 5.4.3](https://echarts.apache.org/)（CDN 引入）
- **数据存储**：浏览器 localStorage

---

## 📄 License

MIT

---

## 🙏 致谢

- [滴答清单 / TickTick](https://dida365.com) — 优秀的任务管理工具
- [Apache ECharts](https://echarts.apache.org/) — 强大的可视化图表库
