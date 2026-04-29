const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const db = require('./models/db');
const sheetRoutes = require('./routes/sheets');
const practiceRoutes = require('./routes/practice');
const aiRoutes = require('./routes/ai');
const searchRoutes = require('./routes/search');
const userRoutes = require('./routes/users');
const musescoreRoutes = require('./routes/musescore');
const musicxmlRoutes = require('./routes/musicxml');

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(morgan('dev'));

// 静态文件 - 上传目录
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 生产环境：提供 Vue 前端构建产物
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

// 限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// Body parser（跳过 multipart）
const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '10mb' });

app.use('/api', (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) return next();
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlencodedParser(req, res, next);
  });
});

// API 路由
app.use('/api/sheets', sheetRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/musescore', musescoreRoutes);
app.use('/api/musicxml', musicxmlRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});

// SPA 回退：非API请求返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 启动
db.init()
  .then(() => {
    console.log('数据库初始化成功');
    const server = app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 300000;
  })
  .catch(err => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  });
