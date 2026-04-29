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
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png', '.mp3', '.wav', '.midi', '.mid', '.xml', '.musicxml', '.mxl'];
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

    const { composer, difficulty, source } = req.body;
    // multer 默认按 latin1 解码原文件名，需修正为 utf8 防止中文乱码
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, path.extname(originalName));

    // 文件分类
    const isMidi = ext === '.mid' || ext === '.midi';
    const isXml = ext === '.xml' || ext === '.musicxml' || ext === '.mxl';

    const midiPath = isMidi ? req.file.filename : null;
    const xmlPath = isXml ? req.file.filename : null;
    const localPath = (isMidi || isXml) ? null : req.file.filename;

    // 若为 MusicXML，尝试提取标题/作曲家/乐器等元数据
    let parsedMeta = null;
    if (isXml) {
      try {
        const { parseMusicXML } = require('../services/musicxml');
        parsedMeta = parseMusicXML(req.file.path);
      } catch (e) {
        console.warn('[sheets/upload] MusicXML 解析失败:', e.message);
      }
    }

    // title 优先级：用户填 > XML 解析 > 文件名
    const title =
      (req.body.title && req.body.title.trim()) ||
      (parsedMeta?.title) ||
      baseName;

    const finalComposer = composer || parsedMeta?.composer || null;

    const result = await db.run(
      `INSERT INTO sheets (title, composer, difficulty, source, local_path, midi_path, xml_path, file_type, file_size, metadata, is_downloaded, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        title,
        finalComposer,
        difficulty || null,
        source || 'local',
        localPath,
        midiPath,
        xmlPath,
        req.file.mimetype,
        req.file.size,
        parsedMeta ? JSON.stringify(parsedMeta) : null,
        req.body.user_id || null,
      ]
    );

    res.json({
      id: result.id,
      message: '上传成功',
      file: req.file.filename,
      title,
      is_midi: isMidi,
      is_xml: isXml,
      meta: parsedMeta,
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

// 删除琴谱（同时清理 local/midi/xml 三处文件）
router.delete('/:id', async (req, res) => {
  try {
    const sheet = await db.get(
      'SELECT local_path, midi_path, xml_path FROM sheets WHERE id = ?',
      [req.params.id]
    );

    if (sheet) {
      const dir = path.join(__dirname, '../../uploads/sheets');
      for (const fname of [sheet.local_path, sheet.midi_path, sheet.xml_path]) {
        if (!fname) continue;
        const filePath = path.join(dir, fname);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('删除文件失败（继续）:', filePath, e.message);
        }
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
