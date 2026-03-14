const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { parseMuseScoreUrl, getRecommendedCelloSheets, isValidMuseScoreUrl } = require('../services/musescore');

/**
 * POST /api/musescore/parse
 * 解析 MuseScore 链接
 */
router.post('/parse', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !isValidMuseScoreUrl(url)) {
      return res.status(400).json({ error: '请输入有效的 MuseScore 链接' });
    }

    console.log('解析 MuseScore URL:', url);

    // 爬取琴谱信息
    const sheetInfo = await parseMuseScoreUrl(url);

    // 检查是否已存在
    const existing = await db.get(
      'SELECT id FROM sheets WHERE source_url = ?',
      [url]
    );

    res.json({
      ...sheetInfo,
      exists: !!existing,
      existing_id: existing?.id
    });

  } catch (err) {
    console.error('解析 MuseScore 链接失败:', err);
    res.status(500).json({
      error: '解析失败',
      message: err.message,
      tip: '请确保链接是公开可访问的 MuseScore 琴谱页面'
    });
  }
});

/**
 * POST /api/musescore/save
 * 保存 MuseScore 琴谱到本地
 */
router.post('/save', async (req, res) => {
  try {
    const { url, user_id } = req.body;

    if (!url || !isValidMuseScoreUrl(url)) {
      return res.status(400).json({ error: '无效的链接' });
    }

    // 检查是否已存在
    const existing = await db.get(
      'SELECT id FROM sheets WHERE source_url = ?',
      [url]
    );

    if (existing) {
      return res.json({
        id: existing.id,
        message: '琴谱已存在',
        exists: true
      });
    }

    // 爬取琴谱信息
    const sheetInfo = await parseMuseScoreUrl(url);

    // 保存到数据库
    const result = await db.run(
      `INSERT INTO sheets
       (title, composer, difficulty, source, source_url, thumbnail, metadata, is_downloaded, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sheetInfo.title,
        sheetInfo.composer,
        sheetInfo.difficulty,
        'MuseScore',
        url,
        sheetInfo.thumbnail,
        JSON.stringify(sheetInfo.metadata),
        0,
        user_id || null
      ]
    );

    res.json({
      id: result.id,
      message: '保存成功',
      sheet: sheetInfo
    });

  } catch (err) {
    console.error('保存 MuseScore 琴谱失败:', err);
    res.status(500).json({
      error: '保存失败',
      message: err.message
    });
  }
});

/**
 * GET /api/musescore/recommendations
 * 获取推荐的大提琴琴谱
 */
router.get('/recommendations', async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    console.log('获取 MuseScore 推荐琴谱...');

    const recommendations = await getRecommendedCelloSheets(parseInt(limit));

    res.json({
      count: recommendations.length,
      data: recommendations
    });

  } catch (err) {
    console.error('获取推荐失败:', err);
    res.status(500).json({
      error: '获取推荐失败',
      message: err.message
    });
  }
});

/**
 * POST /api/musescore/batch-save
 * 批量保存推荐琴谱
 */
router.post('/batch-save', async (req, res) => {
  try {
    const { user_id } = req.body;

    // 获取推荐
    const recommendations = await getRecommendedCelloSheets(5);
    const saved = [];
    const skipped = [];

    for (const sheet of recommendations) {
      try {
        // 检查是否已存在
        const existing = await db.get(
          'SELECT id FROM sheets WHERE source_url = ?',
          [sheet.source_url]
        );

        if (existing) {
          skipped.push(sheet.title);
          continue;
        }

        // 保存
        const result = await db.run(
          `INSERT INTO sheets
           (title, composer, difficulty, source, source_url, thumbnail, metadata, is_downloaded, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sheet.title,
            sheet.composer,
            sheet.difficulty,
            'MuseScore',
            sheet.source_url,
            sheet.thumbnail,
            JSON.stringify(sheet.metadata),
            0,
            user_id || null
          ]
        );

        saved.push({ id: result.id, title: sheet.title });

      } catch (err) {
        console.error(`保存 ${sheet.title} 失败:`, err.message);
      }
    }

    res.json({
      message: `成功保存 ${saved.length} 首，跳过 ${skipped.length} 首`,
      saved,
      skipped
    });

  } catch (err) {
    console.error('批量保存失败:', err);
    res.status(500).json({
      error: '批量保存失败',
      message: err.message
    });
  }
});

module.exports = router;
