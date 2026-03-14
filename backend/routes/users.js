const express = require('express');
const router = express.Router();
const db = require('../models/db');

// 获取或创建用户（简化版，不使用密码）
router.post('/login', async (req, res) => {
  try {
    const { username, nickname } = req.body;

    if (!username) {
      return res.status(400).json({ error: '请输入用户名' });
    }

    // 查找用户
    let user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      // 创建新用户
      const result = await db.run(
        'INSERT INTO users (username, nickname) VALUES (?, ?)',
        [username, nickname || username]
      );

      user = {
        id: result.id,
        username,
        nickname: nickname || username,
        level: 1
      };

      // 创建默认设置
      await db.run(
        'INSERT INTO settings (user_id, tuner_reference, theme, language) VALUES (?, 440, "dark", "zh-CN")',
        [result.id]
      );
    }

    res.json({
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      level: user.level,
      created_at: user.created_at
    });

  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取用户信息
router.get('/:id', async (req, res) => {
  try {
    const user = await db.get(
      `SELECT u.*, s.tuner_reference, s.theme, s.language
       FROM users u
       LEFT JOIN settings s ON u.id = s.user_id
       WHERE u.id = ?`,
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取统计数据
    const stats = await db.get(
      `SELECT
        COUNT(*) as total_sessions,
        SUM(duration) as total_duration,
        AVG(total_score) as avg_score
       FROM practice_records
       WHERE user_id = ?`,
      [req.params.id]
    );

    res.json({
      ...user,
      stats: {
        total_sessions: stats?.total_sessions || 0,
        total_duration: stats?.total_duration || 0,
        avg_score: Math.round(stats?.avg_score || 0)
      }
    });

  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 更新用户信息
router.put('/:id', async (req, res) => {
  try {
    const { nickname, avatar, level } = req.body;

    let sql = 'UPDATE users SET';
    const params = [];
    const updates = [];

    if (nickname) {
      updates.push(' nickname = ?');
      params.push(nickname);
    }

    if (avatar) {
      updates.push(' avatar = ?');
      params.push(avatar);
    }

    if (level) {
      updates.push(' level = ?');
      params.push(level);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    updates.push(' updated_at = CURRENT_TIMESTAMP');

    sql += updates.join(',') + ' WHERE id = ?';
    params.push(req.params.id);

    await db.run(sql, params);
    res.json({ message: '更新成功' });

  } catch (err) {
    console.error('更新用户信息失败:', err);
    res.status(500).json({ error: '更新用户信息失败' });
  }
});

// 更新用户设置
router.put('/:id/settings', async (req, res) => {
  try {
    const { tuner_reference, theme, language, notification_enabled } = req.body;

    let sql = 'UPDATE settings SET';
    const params = [];
    const updates = [];

    if (tuner_reference) {
      updates.push(' tuner_reference = ?');
      params.push(tuner_reference);
    }

    if (theme) {
      updates.push(' theme = ?');
      params.push(theme);
    }

    if (language) {
      updates.push(' language = ?');
      params.push(language);
    }

    if (notification_enabled !== undefined) {
      updates.push(' notification_enabled = ?');
      params.push(notification_enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    updates.push(' updated_at = CURRENT_TIMESTAMP');

    sql += updates.join(',') + ' WHERE user_id = ?';
    params.push(req.params.id);

    const result = await db.run(sql, params);

    // 如果没有更新到记录，可能是首次设置
    if (result.changes === 0) {
      await db.run(
        'INSERT OR REPLACE INTO settings (user_id, tuner_reference, theme, language, notification_enabled) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, tuner_reference || 440, theme || 'dark', language || 'zh-CN', notification_enabled !== undefined ? notification_enabled : 1]
      );
    }

    res.json({ message: '设置更新成功' });

  } catch (err) {
    console.error('更新设置失败:', err);
    res.status(500).json({ error: '更新设置失败' });
  }
});

// 获取用户设置
router.get('/:id/settings', async (req, res) => {
  try {
    let settings = await db.get('SELECT * FROM settings WHERE user_id = ?', [req.params.id]);

    if (!settings) {
      // 返回默认设置
      settings = {
        user_id: parseInt(req.params.id),
        tuner_reference: 440,
        theme: 'dark',
        language: 'zh-CN',
        notification_enabled: 1
      };
    }

    res.json(settings);

  } catch (err) {
    console.error('获取设置失败:', err);
    res.status(500).json({ error: '获取设置失败' });
  }
});

module.exports = router;
