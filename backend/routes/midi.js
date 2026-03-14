const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../models/db');
const { parseMidi, isValidMidi, inferDifficulty } = require('../services/midi');

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
    cb(null, `midi-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mid', '.midi', '.smf'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .mid, .midi, .smf 文件'));
    }
  }
});

/**
 * POST /api/midi/parse
 * 解析上传的 MIDI 文件（不保存）
 */
router.post('/parse', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    console.log('解析 MIDI:', req.file.originalname);

    // 解析文件
    const parsedInfo = parseMidi(req.file.path);

    // 删除临时文件
    fs.unlinkSync(req.file.path);

    // 推断难度
    const difficulty = inferDifficulty(parsedInfo.note_count, parsedInfo.duration);

    res.json({
      ...parsedInfo,
      difficulty,
      original_filename: req.file.originalname,
      file_size: req.file.size
    });

  } catch (err) {
    console.error('解析 MIDI 失败:', err);

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
 * POST /api/midi/upload
 * 上传并保存 MIDI 文件
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的文件' });
    }

    const { user_id, title, composer, difficulty } = req.body;

    console.log('上传 MIDI:', req.file.originalname);

    // 解析文件获取信息
    let parsedInfo;
    try {
      parsedInfo = parseMidi(req.file.path);
    } catch (parseErr) {
      console.warn('MIDI 解析警告:', parseErr.message);
      parsedInfo = {
        title: title || req.file.originalname,
        composer: composer || 'Unknown',
        measure_count: null,
        duration: 0,
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
        difficulty || inferDifficulty(parsedInfo.note_count, parsedInfo.duration) || 'intermediate',
        'upload',
        req.file.filename,
        req.file.mimetype || 'audio/midi',
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
        duration: parsedInfo.duration,
        bpm: parsedInfo.bpm,
        instruments: parsedInfo.instruments,
        difficulty: difficulty || inferDifficulty(parsedInfo.note_count, parsedInfo.duration) || 'intermediate'
      }
    });

  } catch (err) {
    console.error('上传 MIDI 失败:', err);

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
 * GET /api/midi/:id/notes
 * 获取 MIDI 音符数据（用于前端播放）
 */
router.get('/:id/notes', async (req, res) => {
  try {
    const sheet = await db.get('SELECT * FROM sheets WHERE id = ?', [req.params.id]);

    if (!sheet) {
      return res.status(404).json({ error: '琴谱不存在' });
    }

    if (!sheet.local_path || !isValidMidi(sheet.local_path)) {
      return res.status(400).json({ error: '不是有效的 MIDI 文件' });
    }

    const filePath = path.join(__dirname, '../../uploads/sheets', sheet.local_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 解析并返回音符
    const parsedInfo = parseMidi(filePath);

    res.json({
      id: sheet.id,
      title: parsedInfo.title,
      bpm: parsedInfo.bpm,
      time_signature: parsedInfo.time_signature,
      notes: parsedInfo.notes
    });

  } catch (err) {
    console.error('获取 MIDI 音符失败:', err);
    res.status(500).json({ error: '获取失败', message: err.message });
  }
});

module.exports = router;
