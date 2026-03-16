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

// 代理路径下的静态文件
commonProxyPaths.forEach(proxyPath => {
  app.use(`${proxyPath}/uploads`, express.static(path.join(__dirname, '../uploads')));
  app.use(`${proxyPath}`, express.static(path.join(__dirname, '../frontend')));
});

// 限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// 支持代理路径前缀
const commonProxyPaths = process.env.PROXY_PATHS ? process.env.PROXY_PATHS.split(',') : [];

// API 路由
const mountApiRoutes = (prefix = '') => {
  app.use(`${prefix}/api/sheets`, sheetRoutes);
  app.use(`${prefix}/api/practice`, practiceRoutes);
  app.use(`${prefix}/api/ai`, aiRoutes);
  app.use(`${prefix}/api/search`, searchRoutes);
  app.use(`${prefix}/api/users`, userRoutes);
  app.use(`${prefix}/api/musescore`, musescoreRoutes);
  app.use(`${prefix}/api/musicxml`, musicxmlRoutes);
  app.use(`${prefix}/api/midi`, midiRoutes);
};

// 挂载到根路径
mountApiRoutes();

// 挂载到代理路径
commonProxyPaths.forEach(proxyPath => {
  mountApiRoutes(proxyPath);
});

// 页面路由
const mountPageRoutes = (prefix = '') => {
  app.get(`${prefix}/`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/index.html'));
  });

  app.get(`${prefix}/tuner`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/tuner.html'));
  });

  app.get(`${prefix}/practice`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/practice.html'));
  });

  app.get(`${prefix}/sheets`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/sheets.html'));
  });

  app.get(`${prefix}/progress`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/progress.html'));
  });

  app.get(`${prefix}/qa`, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/qa.html'));
  });
};

// 挂载到根路径
mountPageRoutes();

// 挂载到代理路径
commonProxyPaths.forEach(proxyPath => mountPageRoutes(proxyPath));

// 健康检查
const mountHealthCheck = (prefix = '') => {
  app.get(`${prefix}/api/health`, (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });
};
mountHealthCheck();
commonProxyPaths.forEach(proxyPath => mountHealthCheck(proxyPath));

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
