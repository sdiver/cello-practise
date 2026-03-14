const express = require('express');
const router = express.Router();
const db = require('../models/db');

// 获取练习记录
router.get('/records', async (req, res) => {
  try {
    const { user_id, page = 1, limit = 20, start_date, end_date } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    let sql = `SELECT pr.*, s.title as sheet_title, s.composer
               FROM practice_records pr
               LEFT JOIN sheets s ON pr.sheet_id = s.id
               WHERE pr.user_id = ?`;
    const params = [user_id];

    if (start_date) {
      sql += ` AND pr.practice_date >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      sql += ` AND pr.practice_date <= ?`;
      params.push(end_date);
    }

    sql += ` ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const records = await db.query(sql, params);

    // 获取总数
    let countSql = `SELECT COUNT(*) as total FROM practice_records WHERE user_id = ?`;
    const countParams = [user_id];

    if (start_date) {
      countSql += ` AND practice_date >= ?`;
      countParams.push(start_date);
    }
    if (end_date) {
      countSql += ` AND practice_date <= ?`;
      countParams.push(end_date);
    }

    const [{ total }] = await db.query(countSql, countParams);

    res.json({
      data: records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (err) {
    console.error('获取练习记录失败:', err);
    res.status(500).json({ error: '获取练习记录失败' });
  }
});

// 获取练习统计
router.get('/stats', async (req, res) => {
  try {
    const { user_id, period = '30' } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    const days = parseInt(period);

    // 总体统计
    const overallStats = await db.get(
      `SELECT
        COUNT(*) as total_sessions,
        SUM(duration) as total_duration,
        AVG(total_score) as avg_score,
        AVG(pitch_score) as avg_pitch,
        AVG(rhythm_score) as avg_rhythm,
        AVG(expression_score) as avg_expression,
        MAX(total_score) as best_score,
        COUNT(DISTINCT practice_date) as practice_days
       FROM practice_records
       WHERE user_id = ? AND practice_date >= date('now', '-${days} days')`,
      [user_id]
    );

    // 按日期统计（用于图表）
    const dailyStats = await db.query(
      `SELECT
        practice_date,
        COUNT(*) as sessions,
        SUM(duration) as duration,
        AVG(total_score) as avg_score
       FROM practice_records
       WHERE user_id = ? AND practice_date >= date('now', '-${days} days')
       GROUP BY practice_date
       ORDER BY practice_date`,
      [user_id]
    );

    // 按曲目统计
    const sheetStats = await db.query(
      `SELECT
        s.id,
        s.title,
        s.composer,
        COUNT(pr.id) as practice_count,
        AVG(pr.total_score) as avg_score,
        MAX(pr.total_score) as best_score
       FROM practice_records pr
       JOIN sheets s ON pr.sheet_id = s.id
       WHERE pr.user_id = ? AND pr.practice_date >= date('now', '-${days} days')
       GROUP BY s.id
       ORDER BY practice_count DESC
       LIMIT 10`,
      [user_id]
    );

    res.json({
      overall: overallStats,
      daily: dailyStats,
      sheets: sheetStats
    });

  } catch (err) {
    console.error('获取练习统计失败:', err);
    res.status(500).json({ error: '获取练习统计失败' });
  }
});

// 获取练习计划
router.get('/plans', async (req, res) => {
  try {
    const { user_id, status } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: '缺少用户ID' });
    }

    let sql = 'SELECT * FROM practice_plans WHERE user_id = ?';
    const params = [user_id];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';

    const plans = await db.query(sql, params);
    res.json(plans);

  } catch (err) {
    console.error('获取练习计划失败:', err);
    res.status(500).json({ error: '获取练习计划失败' });
  }
});

// 创建练习计划
router.post('/plans', async (req, res) => {
  try {
    const { user_id, title, description, sheet_ids, start_date, end_date, daily_duration } = req.body;

    const result = await db.run(
      `INSERT INTO practice_plans (user_id, title, description, sheet_ids, start_date, end_date, daily_duration)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, title, description, JSON.stringify(sheet_ids), start_date, end_date, daily_duration]
    );

    res.json({ id: result.id, message: '创建成功' });

  } catch (err) {
    console.error('创建练习计划失败:', err);
    res.status(500).json({ error: '创建练习计划失败' });
  }
});

// 更新练习计划
router.put('/plans/:id', async (req, res) => {
  try {
    const { progress, status } = req.body;

    let sql = 'UPDATE practice_plans SET';
    const params = [];
    const updates = [];

    if (progress !== undefined) {
      updates.push(' progress = ?');
      params.push(progress);
    }

    if (status) {
      updates.push(' status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    sql += updates.join(',') + ' WHERE id = ?';
    params.push(req.params.id);

    await db.run(sql, params);
    res.json({ message: '更新成功' });

  } catch (err) {
    console.error('更新练习计划失败:', err);
    res.status(500).json({ error: '更新练习计划失败' });
  }
});

// 删除练习计划
router.delete('/plans/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM practice_plans WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });

  } catch (err) {
    console.error('删除练习计划失败:', err);
    res.status(500).json({ error: '删除练习计划失败' });
  }
});

// 保存练习记录
router.post('/records', async (req, res) => {
  try {
    const { user_id, sheet_id, duration, pitch_score, rhythm_score, expression_score, total_score, notes } = req.body;

    const result = await db.run(
      `INSERT INTO practice_records
       (user_id, sheet_id, duration, pitch_score, rhythm_score, expression_score, total_score, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, sheet_id, duration, pitch_score, rhythm_score, expression_score, total_score, notes]
    );

    res.json({ id: result.id, message: '保存成功' });

  } catch (err) {
    console.error('保存练习记录失败:', err);
    res.status(500).json({ error: '保存练习记录失败' });
  }
});

module.exports = router;
