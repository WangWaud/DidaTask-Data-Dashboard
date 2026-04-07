/* ══════════════════════════════════════════
   状态管理
══════════════════════════════════════════ */
const State = {
  period: 'day',          // 当前时间维度
  cursor: new Date(),     // 当前时间游标
  csvTasks: [],           // CSV 导入任务（含已完成）
  filtered: [],           // 当前筛选结果
  selectedProjects: new Set(), // 当前激活的清单筛选（空=全选）
  selectedTags: new Set()      // 当前激活的标签筛选（空=全选）
};

// 清单 → 文件夹 的映射（与滴答清单结构对应）
const FOLDER_MAP = {
  '文献':    '📚 学术研究',
  '实验':    '📚 学术研究',
  '数据分析': '📚 学术研究',
  '实验记录': '📚 学术研究',
  '学术目标': '📚 学术研究',
  '工作':    '👷 工作事务',
  '助学':    '👷 工作事务',
  '提升':    '🆙 自我提升',
  '阅读':    '🆙 自我提升',
  // 运动健康、休闲娱乐、突发事件 为独立清单，不映射
};

/** 获取清单对应的文件夹名，无文件夹则返回清单名本身 */
function getFolderName(projectName) {
  return FOLDER_MAP[projectName]
    || FOLDER_MAP[stripEmoji(projectName)]
    || projectName;
}

// 子清单颜色（与滴答清单截图中颜色对应）
const PROJECT_COLORS = {
  // 学术研究
  '文献':    '#22c55e',   // 绿
  '实验':    '#EA3F4A',   // 红
  '数据分析': '#8b5cf6',   // 紫
  '实验记录': '#0ea5e9',   // 湖蓝
  '学术目标': '#ec4899',   // 粉
  // 工作事务
  '工作':    '#3b82f6',   // 蓝
  '助学':    '#f97316',   // 橙
  // 独立清单
  '突发事件': '#283036',   // 深灰
  '休闲娱乐': '#848BAD',   // 灰紫
  // 自我提升
  '提升':    '#06b6d4',   // 青蓝
  '阅读':    '#db2777',   // 玫红
  '运动健康': '#eab308',   // 黄
};

// 文件夹颜色（比子清单深一些，用于内环）
const FOLDER_COLORS = {
  '📚 学术研究': '#dc2626',   // 深红（与截图 📚 红色对应）
  '👷 工作事务': '#1d4ed8',   // 深蓝（与截图 👷 对应）
  '🆙 自我提升': '#7c3aed',   // 深紫（与截图 🆙 对应）
};

/** 去除字符串开头的 emoji 和空格，用于颜色表查找 */
function stripEmoji(str) {
  if (!str) return '';
  // 循环去除开头的 emoji / 符号 / 变体选择符，直到遇到普通文字
  return str.replace(
    /^[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\uFE0E\u20D0-\u20FF\s]+/gu,
    ''
  ).trim();
}

function resolveProjectColor(projectName) {
  return PROJECT_COLORS[projectName]
    || PROJECT_COLORS[stripEmoji(projectName)]
    || '#9ca3af';
}

function resolveFolderColor(folderName) {
  return FOLDER_COLORS[folderName]
    || FOLDER_COLORS[stripEmoji(folderName)]
    || resolveProjectColor(folderName);
}

/** 去除 emoji 后的清单名（用于 FOLDER_MAP 查找） */
function cleanProjectName(name) {
  return stripEmoji(name);
}

/* ══════════════════════════════════════════
   ECharts 实例
══════════════════════════════════════════ */
let chartPieFolder = null;  // 左：按文件夹
let chartPieProject = null; // 右：按子清单
let chartBar = null;

/* ══════════════════════════════════════════
   工具函数：时间处理
══════════════════════════════════════════ */

/** 解析 ISO 时间字符串为 Date 对象，无效值返回 null */
function parseDate(str) {
  if (!str) return null;
  // 过滤 Excel 错误值（#NAME?, #VALUE!, #REF! 等）及非日期字符串
  if (str.startsWith('#') || str === 'N' || str.length < 8) return null;
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

/** 格式化 Date 为 HH:mm */
function formatTime(date) {
  if (!date) return '—';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 格式化 Date 为 MM-DD HH:mm */
function formatDateTime(date) {
  if (!date) return '—';
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${m}-${d} ${hh}:${mm}`;
}

/** 计算两个 Date 之间的时长（小时，精确到分钟） */
function calcDurationHours(start, end) {
  if (!start || !end) return null;
  const totalMinutes = Math.round((end - start) / 60000); // 精确到分钟
  return totalMinutes / 60; // 返回小时（分数形式，不做额外舍入）
}

/** 格式化时长：0.25 → "0.25h"，1.5 → "1.5h" */
function formatDuration(hours) {
  if (hours === null || hours === undefined) return '—';
  // 保留最多两位小数，去掉多余的 0
  return `${Number(hours.toFixed(2))}h`;
}

/* ══════════════════════════════════════════
   工具函数：时间范围计算
══════════════════════════════════════════ */

/** 获取当前 period + cursor 对应的 [start, end] 范围（均为 Date） */
function getDateRange() {
  const d = new Date(State.cursor);
  let start, end;

  switch (State.period) {
    case 'day':
      start = startOfDay(d);
      end = endOfDay(d);
      break;

    case 'week': {
      const day = d.getDay(); // 0=周日
      const diff = (day === 0 ? -6 : 1 - day); // 调整至周一
      start = startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff));
      end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
      break;
    }

    case 'month':
      start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      break;

    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3);
      start = new Date(d.getFullYear(), q * 3, 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
      break;
    }

    case 'year':
      start = new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
  }

  return { start, end };
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** 生成当前范围的文本标签 */
function getDateLabel() {
  const { start, end } = getDateRange();
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  switch (State.period) {
    case 'day':
      return fmt(start);
    case 'week':
      return `${fmt(start)} ~ ${fmt(end)}`;
    case 'month':
      return `${start.getFullYear()} 年 ${start.getMonth()+1} 月`;
    case 'quarter': {
      const q = Math.floor(start.getMonth() / 3) + 1;
      return `${start.getFullYear()} 年 Q${q}`;
    }
    case 'year':
      return `${start.getFullYear()} 年`;
  }
}

/** 导航：cursor 前进/后退 */
function navigate(dir) {
  const d = new Date(State.cursor);
  switch (State.period) {
    case 'day':     d.setDate(d.getDate() + dir); break;
    case 'week':    d.setDate(d.getDate() + dir * 7); break;
    case 'month':   d.setMonth(d.getMonth() + dir); break;
    case 'quarter': d.setMonth(d.getMonth() + dir * 3); break;
    case 'year':    d.setFullYear(d.getFullYear() + dir); break;
  }
  State.cursor = d;
  State.selectedProjects.clear();
  State.selectedTags.clear();
  applyFilters();
}

/** 回到今天 */
function goToday() {
  State.cursor = new Date();
  State.selectedProjects.clear();
  State.selectedTags.clear();
  applyFilters();
}

/* ══════════════════════════════════════════
   工具函数：清单颜色
══════════════════════════════════════════ */

/** 将清单颜色（#hex 或 ticktick 数字色）转为 CSS 颜色 */
function resolveColor(color) {
  if (!color) return '#4f7cff';
  if (String(color).startsWith('#')) return color;
  // ticktick 有时返回十进制整数色值
  if (typeof color === 'number' || /^\d+$/.test(color)) {
    return '#' + parseInt(color).toString(16).padStart(6, '0');
  }
  return color;
}

/** 给颜色加半透明背景 */
function colorWithAlpha(hex, alpha = 0.12) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ══════════════════════════════════════════
   优先级文本
══════════════════════════════════════════ */
const PRIORITY_MAP = { 0: '无', 1: '低', 3: '中', 5: '高' };

/* ══════════════════════════════════════════
   CSV 导入：解析滴答清单备份文件
   格式：前 6 行为元数据，第 7 行为表头
   列：Folder Name, List Name, Title, Tags, Content,
       Is Check list, Start Date, Due Date, Reminder,
       Repeat, Priority, Status, Created Time,
       Completed Time, Order, Timezone, Is All Day,
       Is Floating, Column Name, Column Order,
       View Mode, taskId, parentId
══════════════════════════════════════════ */

function handleCsvImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const tasks = parseCsv(text);
      State.csvTasks = tasks;
      // 持久化到 localStorage
      localStorage.setItem('csvTasks', JSON.stringify(tasks));
      updateCsvUI(true, tasks.length);
      applyFilters();
      console.log(`[CSV] 导入成功：${tasks.length} 条任务`);
    } catch (err) {
      alert('CSV 解析失败：' + err.message);
      console.error('[CSV] 解析失败：', err);
    }
  };
  reader.readAsText(file, 'UTF-8');
  // 清空 input，允许重复选同一文件
  event.target.value = '';
}

function parseCsv(text) {
  // 统一换行符为 \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // ── 第一步：整体字符流解析，正确处理引号内的换行 ──
  // 把整个文本解析为 rows（二维数组），不提前 split('\n')
  const rows = [];
  let row = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        cur += '"'; i++;          // 转义双引号 "" → "
      } else {
        inQuote = !inQuote;       // 进入/离开引号区
      }
    } else if (ch === ',' && !inQuote) {
      row.push(cur); cur = '';    // 字段分隔
    } else if (ch === '\n' && !inQuote) {
      row.push(cur); cur = '';    // 行结束
      rows.push(row); row = [];
    } else {
      cur += ch;                  // 引号内换行直接当字符保留
    }
  }
  // 处理最后一行（文件末尾无换行时）
  if (cur || row.length) { row.push(cur); rows.push(row); }

  // ── 第二步：找表头行 ──
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = rows[i].join(',');
    if (joined.includes('Title') && joined.includes('List Name')) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) throw new Error('未找到表头行，请确认是滴答清单导出的备份 CSV');

  const headers = rows[headerIdx].map(h => h.trim());
  const tasks = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length < 3) continue; // 跳过空行/过短行

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });

    const task = mapCsvRowToTask(row);
    if (task) tasks.push(task);
  }

  return tasks;
}

/** 保留此函数供其他地方调用，但 parseCsv 已不再使用它 */
function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else { cur += ch; }
  }
  result.push(cur);
  return result;
}

/** 将 CSV 行映射为与 API 任务一致的对象 */
function mapCsvRowToTask(row) {
  const title = row['Title'];
  if (!title) return null;

  // 优先级映射：CSV 中 0=无, 1=低, 3=中, 5=高
  const priorityMap = { '0': 0, '1': 1, '3': 3, '5': 5 };

  // 状态：CSV Status 0=未完成，1=已完成（部分版本），2=已完成
  const statusRaw = row['Status'] || '0';
  const completedTime = row['Completed Time'];
  // 有 completedTime 或 status 为 1/2 均视为已完成
  const isCompleted = !!(completedTime || statusRaw === '1' || statusRaw === '2');

  const projectName = row['List Name'] || row['Folder Name'] || '未知清单';
  const folderName = getFolderName(projectName);

  const startDate = row['Start Date'] || null;
  const dueDate   = row['Due Date']   || null;

  // 调试：打印字段解析异常的行
  if (title && (!parseDate(startDate) && !parseDate(dueDate) && !parseDate(completedTime))) {
    console.warn('[CSV 解析警告] 所有日期字段均无效，任务将无法显示：', title,
      '| Start Date:', JSON.stringify(startDate),
      '| Due Date:',   JSON.stringify(dueDate),
      '| Completed:',  JSON.stringify(completedTime));
  }

  return {
    id: row['taskId'] || ('csv_' + Math.random().toString(36).slice(2)),
    title,
    projectName,
    folderName,
    projectColor: null,
    tags: row['Tags'] ? row['Tags'].split(/[,，]/).map(t => t.trim()).filter(Boolean) : [],
    startDate,
    dueDate,
    completedTime: completedTime || null,
    isAllDay: row['Is All Day'] === 'true' || row['Is All Day'] === '1',
    priority: priorityMap[row['Priority']] ?? 0,
    status: isCompleted ? 2 : 0,
    _source: 'csv'
  };
}

function clearCsv() {
  State.csvTasks = [];
  localStorage.removeItem('csvTasks');
  updateCsvUI(false, 0);
  applyFilters();
}

function updateCsvUI(hasData, count) {
  const badge = document.getElementById('csv-badge');
  const clearBtn = document.getElementById('btn-clear-csv');
  if (hasData) {
    badge.textContent = `📎 CSV：${count} 条历史任务`;
    badge.classList.remove('hidden');
    clearBtn.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    clearBtn.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════
   数据加载
══════════════════════════════════════════ */
async function loadData() {
  // 纯 CSV 模式不加载远程数据
  State.projects = [];
  State.tasks = [];
  applyFilters();
}

/* ══════════════════════════════════════════
   筛选逻辑
══════════════════════════════════════════ */
function applyFilters() {
  const { start, end } = getDateRange();

  State.filtered = State.csvTasks.filter(task => {
    // 清单筛选（支持按子清单名 或 文件夹名匹配）
    if (State.selectedProjects.size > 0) {
      const matchProject = State.selectedProjects.has(task.projectName);
      const matchFolder  = State.selectedProjects.has(task.folderName);
      if (!matchProject && !matchFolder) return false;
    }

    // 标签筛选（任意一个标签命中即可）
    if (State.selectedTags.size > 0) {
      const hasTag = (task.tags || []).some(t => State.selectedTags.has(t));
      if (!hasTag) return false;
    }

    // 时间范围筛选
    // 任务归属时间：优先用 startDate，其次 dueDate，最后 completedTime
    // 不用 completedTime 归属，避免「昨天做、今天打卡」的任务被算到今天
    const refDate = parseDate(task.startDate)
      || parseDate(task.dueDate)
      || parseDate(task.completedTime);

    if (!refDate) return false;
    return refDate >= start && refDate <= end;
  });

  document.getElementById('date-label').textContent = getDateLabel();
  // 同步日期选择器的值
  const c = new Date(State.cursor);
  document.getElementById('date-picker').value =
    `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}-${String(c.getDate()).padStart(2,'0')}`;
  document.getElementById('task-count').textContent = `${State.filtered.length} 条`;

  renderProjectFilterBar();
  renderTagFilterBar();
  renderTable();
  renderCharts();
}

/** 渲染清单筛选按钮栏（支持文件夹分组） */
function renderProjectFilterBar() {
  const bar = document.getElementById('project-filter-bar');
  if (!bar) return;

  const { start, end } = getDateRange();

  // 提取当前时间范围内出现的子清单
  const projectsInRange = new Map(); // projectName → folderName

  State.csvTasks.forEach(task => {
    const refDate = parseDate(task.startDate)
      || parseDate(task.dueDate)
      || parseDate(task.completedTime);
    if (!refDate || refDate < start || refDate > end) return;
    // 实时重算 folderName（避免 localStorage 旧数据中 folderName 未正确映射）
    const folderName = getFolderName(task.projectName);
    projectsInRange.set(task.projectName, folderName);
  });

  if (projectsInRange.size < 2) { bar.innerHTML = ''; return; }

  // 按文件夹分组：folderName → [projectName, ...]
  const groups = new Map();
  projectsInRange.forEach((folderName, pName) => {
    if (!groups.has(folderName)) groups.set(folderName, []);
    groups.get(folderName).push(pName);
  });

  let html = `<span class="filter-label">清单：</span>`;
  const allActive = State.selectedProjects.size === 0;
  html += `<button class="project-filter-btn${allActive ? ' active' : ''}"
    style="${allActive ? 'background:var(--primary);' : ''}"
    data-project="__all__">全部</button>`;

  let firstGroup = true;
  groups.forEach((projectNames, folderName) => {
    if (!firstGroup) html += `<span class="filter-group-sep"></span>`;
    firstGroup = false;

    // 判断这是真正的文件夹（folderName 与子清单名不同）
    const isRealFolder = projectNames.some(p => p !== folderName);

    // 文件夹按钮：只要有子清单就显示
    if (isRealFolder) {
      const fc = resolveFolderColor(folderName);
      const folderActive = State.selectedProjects.has(folderName);
      html += `<button class="project-filter-btn folder-btn${folderActive ? ' active' : ''}"
        style="${folderActive
          ? `background:${fc};color:#fff;border-color:transparent;`
          : `border-color:${fc};color:${fc};font-weight:600;`}"
        data-project="${escHtml(folderName)}">${escHtml(folderName)}</button>`;
    }

    // 子清单按钮
    projectNames.forEach(pName => {
      const c = resolveProjectColor(pName);
      const isActive = State.selectedProjects.has(pName);
      html += `<button class="project-filter-btn${isActive ? ' active' : ''}"
        style="${isActive
          ? `background:${c};color:#fff;border-color:transparent;`
          : `border-color:${c}55;`}"
        data-project="${escHtml(pName)}">
        <span class="project-filter-dot" style="background:${c}"></span>
        ${escHtml(pName)}
      </button>`;
    });
  });

  bar.innerHTML = html;
}

/** 渲染标签筛选按钮栏 */
function renderTagFilterBar() {
  const bar = document.getElementById('tag-filter-bar');
  if (!bar) return;

  const { start, end } = getDateRange();

  // 提取当前时间范围内出现的所有标签
  const tagsInRange = new Set();
  State.csvTasks.forEach(task => {
    const refDate = parseDate(task.startDate)
      || parseDate(task.dueDate)
      || parseDate(task.completedTime);
    if (!refDate || refDate < start || refDate > end) return;
    (task.tags || []).forEach(t => tagsInRange.add(t));
  });

  if (tagsInRange.size === 0) { bar.innerHTML = ''; return; }

  let html = `<span class="filter-label">标签：</span>`;
  const allActive = State.selectedTags.size === 0;
  html += `<button class="tag-filter-btn${allActive ? ' active' : ''}"
    data-tag="__all__">全部</button>`;

  // 标签按使用频率排序
  const tagCount = new Map();
  State.csvTasks.forEach(task => {
    const refDate = parseDate(task.startDate)
      || parseDate(task.dueDate)
      || parseDate(task.completedTime);
    if (!refDate || refDate < start || refDate > end) return;
    (task.tags || []).forEach(t => tagCount.set(t, (tagCount.get(t) || 0) + 1));
  });

  [...tagsInRange]
    .sort((a, b) => (tagCount.get(b) || 0) - (tagCount.get(a) || 0))
    .forEach(tag => {
      const isActive = State.selectedTags.has(tag);
      const count = tagCount.get(tag) || 0;
      html += `<button class="tag-filter-btn${isActive ? ' active' : ''}"
        data-tag="${escHtml(tag)}">
        # ${escHtml(tag)}<span style="opacity:0.6;margin-left:3px">${count}</span>
      </button>`;
    });

  bar.innerHTML = html;
}

/** 点击清单筛选按钮 */
function toggleProjectFilter(name) {
  if (name === '__all__') {
    State.selectedProjects.clear();
  } else {
    if (State.selectedProjects.has(name)) {
      State.selectedProjects.delete(name);
    } else {
      State.selectedProjects.add(name);
    }
  }
  applyFilters();
}

/** 点击标签筛选按钮 */
function toggleTagFilter(tag) {
  if (tag === '__all__') {
    State.selectedTags.clear();
  } else {
    if (State.selectedTags.has(tag)) {
      State.selectedTags.delete(tag);
    } else {
      State.selectedTags.add(tag);
    }
  }
  applyFilters();
}

/* ══════════════════════════════════════════
   渲染表格
══════════════════════════════════════════ */
function renderTable() {
  const tbody = document.getElementById('task-tbody');

  if (State.filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">该时间段内暂无任务</td></tr>`;
    return;
  }

  // 排序：已完成任务按 completedTime 倒序，未完成按 startDate/dueDate 升序
  const sorted = [...State.filtered].sort((a, b) => {
    // 已完成在下方
    if (a.status === 2 && b.status !== 2) return 1;
    if (a.status !== 2 && b.status === 2) return -1;
    const da = parseDate(a.startDate) || parseDate(a.dueDate) || 0;
    const db = parseDate(b.startDate) || parseDate(b.dueDate) || 0;
    return da - db;
  });

  tbody.innerHTML = sorted.map(task => {
    const startDate = parseDate(task.startDate);
    const dueDate = parseDate(task.dueDate);
    const color = resolveProjectColor(task.projectName);
    const isCompleted = task.status === 2;

    // 行高亮：已完成任务稍微降低饱和度
    const rowClass = isCompleted ? ' class="row-completed"' : '';

    // 时长
    let durationHtml;
    if (task.isAllDay) {
      durationHtml = `<span class="duration-allday">全天</span>`;
    } else {
      const h = calcDurationHours(startDate, dueDate);
      durationHtml = h !== null && h > 0
        ? `<span class="duration-cell">${formatDuration(h)}</span>`
        : '—';
    }

    // 标签
    const tagsHtml = (task.tags && task.tags.length > 0)
      ? `<div class="tag-list">${task.tags.map(t => `<span class="tag-chip">${t}</span>`).join('')}</div>`
      : '<span style="color:var(--text-muted)">—</span>';

    // 优先级
    const pri = task.priority || 0;
    const priText = PRIORITY_MAP[pri] || '无';

    // 状态列
    let statusHtml;
    if (isCompleted) {
      const ct = parseDate(task.completedTime);
      statusHtml = ct
        ? `<span class="status-completed">✅ ${formatDateTime(ct)}</span>`
        : `<span class="status-completed">✅ 已完成</span>`;
    } else {
      statusHtml = `<span class="status-todo-text">⏳ 待完成</span>`;
    }

    return `
      <tr${rowClass}>
        <td>
          <span class="task-title" title="${escHtml(task.title)}">
            ${escHtml(task.title)}
          </span>
        </td>
        <td>
          <span class="project-badge" style="background:${colorWithAlpha(color)};color:${color}">
            <span class="project-dot" style="background:${color}"></span>
            ${escHtml(task.projectName || '未知清单')}
          </span>
        </td>
        <td>${tagsHtml}</td>
        <td style="white-space:nowrap;color:var(--text-secondary)">${task.isAllDay ? '全天' : formatDateTime(startDate)}</td>
        <td style="white-space:nowrap;color:var(--text-secondary)">${task.isAllDay ? '全天' : formatDateTime(dueDate)}</td>
        <td>${durationHtml}</td>
        <td><span class="priority-badge priority-${pri}">${priText}</span></td>
        <td>${statusHtml}</td>
      </tr>
    `;
  }).join('');
}

/** 转义 HTML 特殊字符 */
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════
   渲染图表
══════════════════════════════════════════ */
function renderCharts() {
  // 仅统计非全天、有时长的任务
  const withDuration = State.filtered.filter(t => {
    if (t.isAllDay) return false;
    const s = parseDate(t.startDate);
    const e = parseDate(t.dueDate);
    return s && e && e > s;
  });

  // 按子清单聚合（外环）
  const projectMap = {}; // projectName → { totalHours, color, folderName }
  withDuration.forEach(task => {
    const name = task.projectName || '未知清单';
    const hours = calcDurationHours(parseDate(task.startDate), parseDate(task.dueDate));
    if (!projectMap[name]) projectMap[name] = {
      totalHours: 0,
      color: resolveProjectColor(name),
      folderName: getFolderName(name)  // 实时重算，不依赖存储的旧值
    };
    projectMap[name].totalHours += hours;
  });

  // ========== 计算并渲染周总结卡片 ==========
  let totalWorkHours = 0;
  let academicHours = 0;
  let sportHours = 0;

  Object.entries(projectMap).forEach(([pName, { totalHours, folderName }]) => {
    const cleanF = stripEmoji(folderName);
    const cleanP = stripEmoji(pName);

    if (['学术研究', '工作事务', '自我提升', '突发事件'].includes(cleanF) || ['学术研究', '工作事务', '自我提升', '突发事件'].includes(cleanP)) {
      totalWorkHours += totalHours;
    }
    if (cleanF === '学术研究' || cleanP === '学术研究') {
      academicHours += totalHours;
    }
    if (cleanP === '运动健康' || cleanF === '运动健康') {
      sportHours += totalHours;
    }
  });

  const coreMetricsBox = document.getElementById('core-metrics');
  if (coreMetricsBox) {
    coreMetricsBox.innerHTML = `
      <div style="flex: 1; min-width: 150px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">总工作时长</div>
        <div style="font-size: 24px; font-weight: bold; color: #0f172a;">${formatDuration(totalWorkHours)}</div>
      </div>
      <div style="flex: 1; min-width: 150px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">学术研究时长</div>
        <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${formatDuration(academicHours)}</div>
      </div>
      <div style="flex: 1; min-width: 150px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center;">
        <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">运动时长</div>
        <div style="font-size: 24px; font-weight: bold; color: #eab308;">${formatDuration(sportHours)}</div>
      </div>
    `;
  }

  // 按文件夹聚合（文件夹饼图用）
  // 有文件夹映射的清单 → 合并到文件夹名下，用文件夹颜色
  // 独立清单（无 FOLDER_MAP 映射）→ 保留清单名，用清单颜色
  const folderMap = {}; // displayName → { totalHours, color }
  Object.entries(projectMap).forEach(([pName, { totalHours, folderName }]) => {
    const cleanP = stripEmoji(pName);
    const cleanF = stripEmoji(folderName);
    const isIndependent = (cleanP === cleanF); // 独立清单：folderName 等于自身
    const key = folderName;  // 文件夹名或清单名（独立清单时两者相同）
    const color = isIndependent
      ? resolveProjectColor(pName)   // 独立清单：用清单颜色
      : resolveFolderColor(folderName); // 有文件夹的：用文件夹颜色
    if (!folderMap[key]) folderMap[key] = { totalHours: 0, color };
    folderMap[key].totalHours += totalHours;
  });

  const projectNames = Object.keys(projectMap);
  const projectColors = projectNames.map(n => projectMap[n].color);
  const projectHours = projectNames.map(n => projectMap[n].totalHours);

  const folderNames = Object.keys(folderMap);
  const folderColors = folderNames.map(n => folderMap[n].color);
  const folderHours = folderNames.map(n => folderMap[n].totalHours);

  renderPieFolder(folderNames, folderHours, folderColors);
  renderPieProject(projectNames, projectHours, projectColors);
  renderBarChart(withDuration, projectNames, projectColors);
}

/** 通用单环饼图渲染器 */
function renderSinglePie(chart, names, hours, colors, emptyText) {
  chart.resize();
  if (names.length === 0) {
    chart.setOption({
      title: { text: emptyText, left: 'center', top: 'center', textStyle: { color: '#9ca3af', fontSize: 13 } },
      series: []
    }, true);
    return;
  }
  const data = names.map((name, i) => ({
    name,
    value: hours[i],
    itemStyle: { color: colors[i] }
  }));

  chart.setOption({
    title: { text: '' },
    color: colors,
    tooltip: {
      trigger: 'item',
      formatter: (p) => `${p.name}<br/>${formatDuration(p.value)}（${p.percent}%）`
    },
    legend: {
      orient: 'vertical',
      right: 0,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 10,
      textStyle: { fontSize: 12 },
      formatter: (name) => {
        const idx = names.indexOf(name);
        return `${name}  ${formatDuration(hours[idx])}`;
      }
    },
    series: [{
      type: 'pie',
      radius: ['38%', '68%'],
      // 限定饼图只在左侧 60% 宽度内绘制，右侧留给图例
      left: 0,
      right: '42%',
      top: 0,
      bottom: 0,
      data,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } }
    }]
  }, true);
}

/** 左饼图：按文件夹 */
function renderPieFolder(fNames, fHours, fColors) {
  if (!chartPieFolder) {
    chartPieFolder = echarts.init(document.getElementById('chart-pie-folder'));
  }
  renderSinglePie(chartPieFolder, fNames, fHours, fColors, '暂无数据');
}

/** 右饼图：按子清单 */
function renderPieProject(pNames, pHours, pColors) {
  if (!chartPieProject) {
    chartPieProject = echarts.init(document.getElementById('chart-pie-project'));
  }
  renderSinglePie(chartPieProject, pNames, pHours, pColors, '暂无数据');
}

/** 柱状图：各清单时间趋势 */
function renderBarChart(tasks, projectNames, projectColors) {
  if (!chartBar) {
    chartBar = echarts.init(document.getElementById('chart-bar'));
  }
  // 每次渲染前确保尺寸与容器一致
  chartBar.resize();

  if (tasks.length === 0) {
    chartBar.setOption({
      title: { text: '暂无数据', left: 'center', top: 'center', textStyle: { color: '#9ca3af', fontSize: 14 } },
      series: []
    }, true);
    return;
  }

  // 根据 period 决定 X 轴粒度
  const xCategories = getBarXCategories();

  // 每个清单 × 每个 X 分类的时长矩阵
  const seriesData = projectNames.map((pName, pIdx) => {
    const data = xCategories.map(cat => {
      const matched = tasks.filter(t => {
        if (t.projectName !== pName) return false;
        const d = parseDate(t.dueDate) || parseDate(t.startDate);
        return d && getXCategory(d) === cat;
      });
      const total = matched.reduce((sum, t) => {
        return sum + (calcDurationHours(parseDate(t.startDate), parseDate(t.dueDate)) || 0);
      }, 0);
      return total;
    });
    return {
      name: pName,
      type: 'bar',
      stack: 'total',
      data,
      itemStyle: { color: projectColors[pIdx] },
      emphasis: { focus: 'series' }
    };
  });

  chartBar.setOption({
    color: projectColors,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        let html = `<b>${params[0].axisValue}</b><br/>`;
        params.filter(p => p.value > 0).forEach(p => {
          html += `<span style="color:${p.color}">●</span> ${p.seriesName}：${formatDuration(p.value)}<br/>`;
        });
        return html;
      }
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 11 },
      type: 'scroll'
    },
    grid: { top: 10, left: 10, right: 10, bottom: 50, containLabel: true },
    xAxis: {
      type: 'category',
      data: xCategories,
      axisLabel: { fontSize: 11, rotate: xCategories.length > 10 ? 30 : 0 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: v => v + 'h', fontSize: 11 },
      minInterval: 0.5
    },
    series: seriesData
  }, true);
}

/** 根据 period 生成 X 轴分类列表 */
function getBarXCategories() {
  const { start, end } = getDateRange();
  const cats = [];

  switch (State.period) {
    case 'day': {
      // X 轴按小时：00~23
      for (let h = 0; h < 24; h++) {
        cats.push(String(h).padStart(2, '0') + ':00');
      }
      break;
    }
    case 'week': {
      // X 轴按天：周一~周日
      const d = new Date(start);
      while (d <= end) {
        cats.push(`${d.getMonth()+1}/${d.getDate()}`);
        d.setDate(d.getDate() + 1);
      }
      break;
    }
    case 'month': {
      // X 轴按天
      const d = new Date(start);
      while (d <= end) {
        cats.push(`${d.getDate()}日`);
        d.setDate(d.getDate() + 1);
      }
      break;
    }
    case 'quarter': {
      // X 轴按周
      const d = new Date(start);
      while (d <= end) {
        cats.push(`${d.getMonth()+1}/${d.getDate()}`);
        d.setDate(d.getDate() + 7);
      }
      break;
    }
    case 'year': {
      // X 轴按月
      for (let m = 1; m <= 12; m++) {
        cats.push(`${m}月`);
      }
      break;
    }
  }
  return cats;
}

/** 将一个 Date 映射到对应的 X 轴分类字符串 */
function getXCategory(date) {
  switch (State.period) {
    case 'day':
      return String(date.getHours()).padStart(2, '0') + ':00';
    case 'week':
    case 'quarter':
      return `${date.getMonth()+1}/${date.getDate()}`;
    case 'month':
      return `${date.getDate()}日`;
    case 'year':
      return `${date.getMonth()+1}月`;
  }
}

/* ══════════════════════════════════════════
   UI 工具
══════════════════════════════════════════ */
function showLoading(show) {
  document.getElementById('loading-mask').classList.toggle('hidden', !show);
}

function updateAuthUI(authorized) {
  const statusEl = document.getElementById('auth-status');
  const refreshBtn = document.getElementById('btn-refresh');
  const authBtn = document.getElementById('btn-auth');

  if (authorized) {
    statusEl.textContent = '已授权';
    statusEl.className = 'auth-status authorized';
    refreshBtn.disabled = false;
    authBtn.textContent = '重新授权';
  } else {
    statusEl.textContent = '未授权';
    statusEl.className = 'auth-status unauthorized';
    refreshBtn.disabled = true;
    authBtn.textContent = '登录授权';
  }
}

/* ══════════════════════════════════════════
   Tab 切换事件
══════════════════════════════════════════ */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.period = btn.dataset.period;
    State.cursor = new Date();
    State.selectedProjects.clear();
    State.selectedTags.clear();
    applyFilters();
  });
});

/* ══════════════════════════════════════════
   清单 & 标签筛选：事件委托
══════════════════════════════════════════ */
document.getElementById('project-filter-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.project-filter-btn');
  if (!btn) return;
  toggleProjectFilter(btn.dataset.project);
});

document.getElementById('tag-filter-bar').addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-filter-btn');
  if (!btn) return;
  toggleTagFilter(btn.dataset.tag);
});

/* ══════════════════════════════════════════
   日期选择器
══════════════════════════════════════════ */
document.getElementById('date-picker').addEventListener('change', (e) => {
  const val = e.target.value; // "YYYY-MM-DD"
  if (!val) return;
  const picked = new Date(val + 'T00:00:00');
  if (isNaN(picked)) return;
  State.cursor = picked;
  State.selectedProjects.clear();
  State.selectedTags.clear();
  applyFilters();
});

/* ══════════════════════════════════════════
   窗口 resize 时重绘图表
══════════════════════════════════════════ */
window.addEventListener('resize', () => {
  chartPieFolder?.resize();
  chartPieProject?.resize();
  chartBar?.resize();
});

/* ══════════════════════════════════════════
   初始化
══════════════════════════════════════════ */
(async function init() {
  // 恢复 localStorage 中的 CSV 数据
  try {
    const savedCsv = localStorage.getItem('csvTasks');
    if (savedCsv) {
      State.csvTasks = JSON.parse(savedCsv);
      updateCsvUI(true, State.csvTasks.length);
    }
  } catch (e) {
    console.warn('CSV 缓存解析失败，已清除：', e);
    localStorage.removeItem('csvTasks');
  }

  // 渲染日期标签并展示数据
  document.getElementById('date-label').textContent = getDateLabel();
  applyFilters();
})();
