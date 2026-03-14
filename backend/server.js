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
const midiRoutes = require('./routes/midi');

const app = express();
const PORT = process.env.PORT || 3001;

// 安全中间件 - 开发环境放宽限制
const isDev = process.env.NODE_ENV === 'development';

app.use(helmet({
  contentSecurityPolicy: false, // 禁用 CSP 简化开发
  crossOriginEmbedderPolicy: false,
  xContentTypeOptions: isDev ? false : true, // 开发环境禁用 nosniff
}));

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// 限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// API 路由
app.use('/api/sheets', sheetRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/musescore', musescoreRoutes);
app.use('/api/musicxml', musicxmlRoutes);
app.use('/api/midi', midiRoutes);

// 页面路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/index.html'));
});

app.get('/tuner', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/tuner.html'));
});

app.get('/practice', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/practice.html'));
});

app.get('/sheets', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/sheets.html'));
});

app.get('/progress', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/progress.html'));
});

app.get('/qa', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/qa.html'));
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 初始化数据库并启动服务器
db.init()
  .then(() => {
    console.log('数据库初始化成功');
    app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  });
