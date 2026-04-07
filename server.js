const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => {
  console.log(`\n🚀 滴答清单看板已启动 (CSV 模式)`);
  console.log(`📌 访问地址：http://localhost:${PORT}`);
});
