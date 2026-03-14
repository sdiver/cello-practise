const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../models/db');
const { parseMusicXML, isValidMusicXML, inferDifficulty } = require('../services/musicxml');

// 配置上传
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
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `musicxml-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xml', '.mxl', '.musicxml'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xml, .mxl, .musicxml 文件'));
    }
  }
});

/**
 * POST /api/musicxml/parse
 * 解析上传的 MusicXML 文件（不保存）
 */
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    console.log('解析 MusicXML:', req.file.originalname);

    // 解析文件
    const parsedInfo = parseMusicXML(req.file.path);

    // 删除临时文件
    fs.unlinkSync(req.file.path);

    // 推断难度
    const difficulty = inferDifficulty(parsedInfo.measure_count, parsedInfo.instruments);

    res.json({
      ...parsedInfo,
      difficulty,
      original_filename: req.file.originalname,
      file_size: req.file.size
    });

  } catch (err) {
    console.error('解析 MusicXML 失败:', err);

    // 清理临时文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: '解析失败',
      message: err.message
    });
  }
});

/**
 * POST /api/musicxml/upload
 * 上传并保存 MusicXML 文件
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const { user_id, title, composer, difficulty } = req.body;

    console.log('上传 MusicXML:', req.file.originalname);

    // 解析文件获取信息
    let parsedInfo;
    try {
      parsedInfo = parseMusicXML(req.file.path);
    } catch (parseErr) {
      // 即使解析失败也保存文件，但记录错误
      console.warn('MusicXML 解析警告:', parseErr.message);
      parsedInfo = {
        title: title || req.file.originalname,
        composer: composer || 'Unknown',
        measure_count: null,
        instruments: []
      };
    }

    // 保存到数据库
    const result = await db.run(
      `INSERT INTO sheets
       (title, composer, difficulty, source, local_path, file_type, file_size, metadata, is_downloaded, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title || parsedInfo.title || req.file.originalname,
        composer || parsedInfo.composer || 'Unknown',
        difficulty || inferDifficulty(parsedInfo.measure_count, parsedInfo.instruments) || 'intermediate',
        'upload',
        req.file.filename,
        req.file.mimetype || 'application/vnd.recordare.musicxml',
        req.file.size,
        JSON.stringify({
          parsed: parsedInfo,
          original_name: req.file.originalname
        }),
        1,
        user_id || null
      ]
    );

    res.json({
      id: result.id,
      message: '上传成功',
      sheet: {
        id: result.id,
        title: title || parsedInfo.title || req.file.originalname,
        composer: composer || parsedInfo.composer || 'Unknown',
        measure_count: parsedInfo.measure_count,
        instruments: parsedInfo.instruments,
        difficulty: difficulty || inferDifficulty(parsedInfo.measure_count, parsedInfo.instruments) || 'intermediate'
      }
    });

  } catch (err) {
    console.error('上传 MusicXML 失败:', err);

    // 清理上传的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: '上传失败',
      message: err.message
    });
  }
});

/**
 * GET /api/musicxml/:id/render
 * 获取 MusicXML 渲染数据（用于前端 OSMD）
 */
router.get('/:id/render', async (req, res) => {
  try {
    const sheet = await db.get('SELECT * FROM sheets WHERE id = ?', [req.params.id]);

    if (!sheet) {
      return res.status(404).json({ error: '琴谱不存在' });
    }

    if (!sheet.local_path || !isValidMusicXML(sheet.local_path)) {
      return res.status(400).json({ error: '不是有效的 MusicXML 文件' });
    }

    const filePath = path.join(__dirname, '../../uploads/sheets', sheet.local_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 读取并返回 XML 内容
    const ext = path.extname(filePath).toLowerCase();
    let xmlContent;

    if (ext === '.mxl') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      const xmlEntry = entries.find(e =>
        e.entryName.endsWith('.xml') &&
        !e.entryName.startsWith('_') &&
        !e.entryName.includes('__MACOSX')
      );

      if (!xmlEntry) {
        return res.status(400).json({ error: '无法读取 .mxl 文件内容' });
      }

      xmlContent = zip.readAsText(xmlEntry);
    } else {
      xmlContent = fs.readFileSync(filePath, 'utf-8');
    }

    res.setHeader('Content-Type', 'application/vnd.recordare.musicxml+xml');
    res.send(xmlContent);

  } catch (err) {
    console.error('获取 MusicXML 内容失败:', err);
    res.status(500).json({ error: '获取失败', message: err.message });
  }
});

module.exports = router;
