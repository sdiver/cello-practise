const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { downloadMidi, parseMidiFile, listMidiFiles } = require('../services/musescore-dl');

/**
 * POST /api/musescore/download
 * 通过 dl-librescore 下载 MuseScore MIDI
 */
router.post('/download', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.includes('musescore.com')) {
      return res.status(400).json({ error: '请输入有效的 MuseScore 链接' });
    }

    console.log('下载 MuseScore MIDI:', url);

    const result = await downloadMidi(url);
    console.log('下载成功:', result.filename);

    // 解析 MIDI 音符
    const midiData = parseMidiFile(result.filepath);

    // 保存到数据库
    const dbResult = await db.run(
      `INSERT INTO sheets (title, composer, difficulty, source, source_url, local_path, file_type, is_downloaded, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [midiData.name, 'MuseScore', 'intermediate', 'musescore', url,
       result.filename, 'midi', req.body.user_id || 1]
    );

    res.json({
      id: dbResult.id,
      filename: result.filename,
      name: midiData.name,
      bpm: midiData.bpm,
      noteCount: midiData.noteCount,
      duration: midiData.duration,
      notes: midiData.notes,
      message: '下载成功'
    });

  } catch (err) {
    console.error('MuseScore 下载失败:', err);
    res.status(500).json({ error: err.message || '下载失败' });
  }
});

/**
 * GET /api/musescore/midi
 * 列出已下载的 MIDI 文件
 */
router.get('/midi', async (req, res) => {
  try {
    const files = listMidiFiles();

    // 从 sheets 表联查 title 和 id——按 midi_path 或 local_path 匹配文件名
    const db = require('../models/db');
    const rows = await db.query(
      `SELECT id, title, midi_path, local_path FROM sheets WHERE midi_path IS NOT NULL OR local_path LIKE '%.mid%'`
    );
    const infoMap = new Map();
    for (const r of rows) {
      if (r.midi_path) infoMap.set(r.midi_path, { title: r.title, sheetId: r.id });
      if (r.local_path && /\.midi?$/i.test(r.local_path))
        infoMap.set(r.local_path, { title: r.title, sheetId: r.id });
    }

    const enriched = files.map(f => {
      const info = infoMap.get(f.filename);
      return {
        ...f,
        name: info?.title || f.name,
        sheetId: info?.sheetId || null,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('获取 MIDI 列表失败:', err);
    res.status(500).json({ error: '获取列表失败' });
  }
});

/**
 * GET /api/musescore/midi/:filename/notes
 * 解析指定 MIDI 文件的音符
 */
router.get('/midi/:filename/notes', async (req, res) => {
  try {
    const { resolveMidiPath } = require('../services/musescore-dl');
    const filepath = resolveMidiPath(req.params.filename);

    if (!filepath) {
      return res.status(404).json({ error: '文件不存在' });
    }

    const midiData = parseMidiFile(filepath);
    res.json(midiData);
  } catch (err) {
    console.error('解析 MIDI 失败:', err);
    res.status(500).json({ error: '解析失败' });
  }
});

module.exports = router;
