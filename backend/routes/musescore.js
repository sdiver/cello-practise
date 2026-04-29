const express = require('express');
const router = express.Router();
const { parseMidiFile, listMidiFiles } = require('../services/musescore-dl');

/**
 * GET /api/musescore/midi
 * 列出本地 MIDI 文件（含数据库联查的真实 title）
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
