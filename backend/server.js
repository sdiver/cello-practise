const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
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
// 注意：body parser 必须在文件上传路由之后挂载，否则会消耗请求流
// 先挂载静态文件和 API 路由，最后在具体路由中处理 body parsing

// 支持代理路径前缀
const commonProxyPaths = process.env.PROXY_PATHS ? process.env.PROXY_PATHS.split(',') : [];

// 静态文件 - 根路径
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));

// 代理路径下的静态文件（只处理非HTML资源，HTML由路由处理）
commonProxyPaths.forEach(proxyPath => {
  app.use(`${proxyPath}/uploads`, express.static(path.join(__dirname, '../uploads')));
  // 只为css/js/lib等静态资源提供代理路径服务，不处理HTML
  app.use(`${proxyPath}/css`, express.static(path.join(__dirname, '../frontend/css')));
  app.use(`${proxyPath}/js`, express.static(path.join(__dirname, '../frontend/js')));
  app.use(`${proxyPath}/lib`, express.static(path.join(__dirname, '../frontend/lib')));
  app.use(`${proxyPath}/pages`, express.static(path.join(__dirname, '../frontend/pages')));
});

// 限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '请求过于频繁，请稍后再试' }
});
app.use('/api/', limiter);

// Body parser 中间件（跳过 multipart 请求）
const jsonParser = express.json({ limit: '10mb' });
const urlencodedParser = express.urlencoded({ extended: true, limit: '10mb' });

// 条件 body parser - 跳过 multipart 请求
const conditionalBodyParser = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  jsonParser(req, res, (err) => {
    if (err) return next(err);
    urlencodedParser(req, res, next);
  });
};

// API 路由
const mountApiRoutes = (prefix = '') => {
  // 先应用条件 body parser
  app.use(`${prefix}/api`, conditionalBodyParser);
  // 再挂载路由
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

// 辅助函数：读取并修复 HTML 中的路径
function serveHtmlWithFixedPaths(res, htmlPath, basePath) {
  try {
    let html = fs.readFileSync(htmlPath, 'utf8');
    if (basePath && basePath !== '') {
      // 使用完整代理路径替换，避免相对路径问题
      // 1. 将绝对路径 "/xxx" 替换为 "<basePath>/xxx"
      html = html.replace(/href="\/([^"]+)"/g, `href="${basePath}/$1"`);
      html = html.replace(/src="\/([^"]+)"/g, `src="${basePath}/$1"`);

      // 2. 将 "../xxx" 替换为 "<basePath>/xxx"
      html = html.replace(/href="\.\.\/([^"]+)"/g, `href="${basePath}/$1"`);
      html = html.replace(/src="\.\.\/([^"]+)"/g, `src="${basePath}/$1"`);
    }
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('读取 HTML 失败:', err);
    res.status(500).send('服务器错误');
  }
}

// 获取代理路径（从请求头或配置）
function getProxyPath(req) {
  // 优先从 portal 传递的请求头获取
  const headerPath = req.headers['x-proxy-path'];
  if (headerPath) return headerPath;
  // 否则使用配置的代理路径（取第一个）
  return commonProxyPaths[0] || '';
}

// 页面路由
const mountPageRoutes = (prefix = '') => {
  app.get(`${prefix}/`, (req, res) => {
    const proxyPath = getProxyPath(req);
    if (proxyPath) {
      serveHtmlWithFixedPaths(res, path.join(__dirname, '../frontend/pages/index.html'), proxyPath);
    } else {
      res.sendFile(path.join(__dirname, '../frontend/pages/index.html'));
    }
  });

  app.get(`${prefix}/tuner`, (req, res) => {
    const proxyPath = getProxyPath(req);
    if (proxyPath) {
      serveHtmlWithFixedPaths(res, path.join(__dirname, '../frontend/pages/tuner.html'), proxyPath);
    } else {
      res.sendFile(path.join(__dirname, '../frontend/pages/tuner.html'));
    }
  });

  app.get(`${prefix}/practice`, (req, res) => {
    const proxyPath = getProxyPath(req);
    if (proxyPath) {
      serveHtmlWithFixedPaths(res, path.join(__dirname, '../frontend/pages/practice.html'), proxyPath);
    } else {
      res.sendFile(path.join(__dirname, '../frontend/pages/practice.html'));
    }
  });

  app.get(`${prefix}/sheets`, (req, res) => {
    const proxyPath = getProxyPath(req);
    if (proxyPath) {
      serveHtmlWithFixedPaths(res, path.join(__dirname, '../frontend/pages/sheets.html'), proxyPath);
    } else {
      res.sendFile(path.join(__dirname, '../frontend/pages/sheets.html'));
    }
  });

  app.get(`${prefix}/progress`, (req, res) => {
    const proxyPath = getProxyPath(req);
    if (proxyPath) {
      serveHtmlWithFixedPaths(res, path.join(__dirname, '../frontend/pages/progress.html'), proxyPath);
    } else {
      res.sendFile(path.join(__dirname, '../frontend/pages/progress.html'));
    }
  });

  app.get(`${prefix}/qa`, (req, res) => {
    const proxyPath = getProxyPath(req);
    if (proxyPath) {
      serveHtmlWithFixedPaths(res, path.join(__dirname, '../frontend/pages/qa.html'), proxyPath);
    } else {
      res.sendFile(path.join(__dirname, '../frontend/pages/qa.html'));
    }
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
    const server = app.listen(PORT, () => {
      console.log(`服务器运行在 http://localhost:${PORT}`);
    });

    // 增加超时设置，防止代理连接被意外断开
    server.keepAliveTimeout = 65000; // 超过代理的 60 秒超时
    server.headersTimeout = 66000;
    server.requestTimeout = 300000; // 5分钟，支持大文件上传
  })
  .catch(err => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  });
