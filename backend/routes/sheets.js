const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../models/db');

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/sheets');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.mp3', '.wav', '.midi', '.mid'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 获取琴谱列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, difficulty, search, source } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT s.*, COUNT(pr.id) as practice_count
               FROM sheets s
               LEFT JOIN practice_records pr ON s.id = pr.sheet_id
               WHERE 1=1`;
    const params = [];

    if (difficulty) {
      sql += ` AND s.difficulty = ?`;
      params.push(difficulty);
    }

    if (source) {
      sql += ` AND s.source = ?`;
      params.push(source);
    }

    if (search) {
      sql += ` AND (s.title LIKE ? OR s.composer LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` GROUP BY s.id ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const sheets = await db.query(sql, params);

    // 获取总数
    let countSql = `SELECT COUNT(*) as total FROM sheets WHERE 1=1`;
    const countParams = [];
    if (difficulty) {
      countSql += ` AND difficulty = ?`;
      countParams.push(difficulty);
    }
    if (source) {
      countSql += ` AND source = ?`;
      countParams.push(source);
    }
    if (search) {
      countSql += ` AND (title LIKE ? OR composer LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const [{ total }] = await db.query(countSql, countParams);

    res.json({
      data: sheets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('获取琴谱列表失败:', err);
    res.status(500).json({ error: '获取琴谱列表失败' });
  }
});

// 获取单张琴谱
router.get('/:id', async (req, res) => {
  try {
    const sheet = await db.get(
      `SELECT s.*,
        (SELECT COUNT(*) FROM practice_records WHERE sheet_id = s.id) as practice_count,
        (SELECT AVG(total_score) FROM practice_records WHERE sheet_id = s.id) as avg_score
       FROM sheets s WHERE s.id = ?`,
      [req.params.id]
    );

    if (!sheet) {
      return res.status(404).json({ error: '琴谱不存在' });
    }

    // 增加下载计数
    await db.run('UPDATE sheets SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);

    res.json(sheet);
  } catch (err) {
    console.error('获取琴谱失败:', err);
    res.status(500).json({ error: '获取琴谱失败' });
  }
});

// 上传琴谱
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const { title, composer, difficulty, source } = req.body;

    const result = await db.run(
      `INSERT INTO sheets (title, composer, difficulty, source, local_path, file_type, file_size, is_downloaded, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [title, composer, difficulty, source || 'local', req.file.filename, req.file.mimetype, req.file.size, req.body.user_id || null]
    );

    res.json({
      id: result.id,
      message: '上传成功',
      file: req.file.filename
    });
  } catch (err) {
    console.error('上传琴谱失败:', err);
    res.status(500).json({ error: '上传琴谱失败' });
  }
});

// 保存从网络下载的琴谱
router.post('/save', async (req, res) => {
  try {
    const { title, composer, difficulty, source, source_url, metadata } = req.body;

    // 检查是否已存在
    const existing = await db.get('SELECT id FROM sheets WHERE source_url = ?', [source_url]);
    if (existing) {
      return res.json({ id: existing.id, message: '琴谱已存在', exists: true });
    }

    const result = await db.run(
      `INSERT INTO sheets (title, composer, difficulty, source, source_url, metadata, is_downloaded, user_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [title, composer, difficulty, source, source_url, JSON.stringify(metadata), req.body.user_id || null]
    );

    res.json({ id: result.id, message: '保存成功' });
  } catch (err) {
    console.error('保存琴谱失败:', err);
    res.status(500).json({ error: '保存琴谱失败' });
  }
});

// 删除琴谱
router.delete('/:id', async (req, res) => {
  try {
    const sheet = await db.get('SELECT local_path FROM sheets WHERE id = ?', [req.params.id]);

    if (sheet && sheet.local_path) {
      const filePath = path.join(__dirname, '../../uploads/sheets', sheet.local_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.run('DELETE FROM sheets WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除琴谱失败:', err);
    res.status(500).json({ error: '删除琴谱失败' });
  }
});

// 获取收藏的琴谱
router.get('/user/favorites', async (req, res) => {
  try {
    const { user_id } = req.query;
    const sheets = await db.query(
      `SELECT s.* FROM sheets s
       JOIN favorites f ON s.id = f.sheet_id
       WHERE f.user_id = ?
       ORDER BY f.created_at DESC`,
      [user_id]
    );
    res.json(sheets);
  } catch (err) {
    console.error('获取收藏失败:', err);
    res.status(500).json({ error: '获取收藏失败' });
  }
});

// 添加收藏
router.post('/:id/favorite', async (req, res) => {
  try {
    const { user_id } = req.body;
    await db.run('INSERT OR IGNORE INTO favorites (user_id, sheet_id) VALUES (?, ?)', [user_id, req.params.id]);
    res.json({ message: '收藏成功' });
  } catch (err) {
    console.error('收藏失败:', err);
    res.status(500).json({ error: '收藏失败' });
  }
});

// 取消收藏
router.delete('/:id/favorite', async (req, res) => {
  try {
    const { user_id } = req.body;
    await db.run('DELETE FROM favorites WHERE user_id = ? AND sheet_id = ?', [user_id, req.params.id]);
    res.json({ message: '取消收藏成功' });
  } catch (err) {
    console.error('取消收藏失败:', err);
    res.status(500).json({ error: '取消收藏失败' });
  }
});

module.exports = router;
