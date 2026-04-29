const express = require('express');
const router = express.Router();
const db = require('../models/db');
const claude = require('../services/claude');

// AI 分析演奏
router.post('/analyze', async (req, res) => {
  try {
    const { pitch_data, duration, sheet_id, user_id } = req.body;

    if (!pitch_data || !Array.isArray(pitch_data)) {
      return res.status(400).json({ error: '缺少音高数据' });
    }

    // 获取琴谱信息
    let sheetTitle = '未知曲目';
    if (sheet_id) {
      const sheet = await db.get('SELECT title FROM sheets WHERE id = ?', [sheet_id]);
      if (sheet) sheetTitle = sheet.title;
    }

    const result = await claude.analyzePractice(pitch_data, sheetTitle, duration);

    // 保存分析结果到数据库
    if (user_id) {
      await db.run(
        `INSERT INTO practice_records
         (user_id, sheet_id, duration, pitch_score, rhythm_score, expression_score, total_score, ai_feedback)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [user_id, sheet_id, duration, result.pitch_score, result.rhythm_score,
         result.expression_score, result.total_score, JSON.stringify(result)]
      );
    }

    res.json(result);

  } catch (err) {
    console.error('AI分析失败:', err);
    res.status(500).json({
      error: 'AI分析失败',
      message: err.message,
      fallback: {
        pitch_score: 80, rhythm_score: 75, expression_score: 78, total_score: 78,
        comment: 'AI服务暂时不可用，这是默认评价。',
        suggestions: ['稍后再试']
      }
    });
  }
});

// AI 问答
router.post('/chat', async (req, res) => {
  try {
    const { message, user_id, session_id = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: '请输入问题' });
    }

    // 保存用户消息
    if (user_id) {
      await db.run(
        'INSERT INTO chat_history (user_id, session_id, role, content) VALUES (?, ?, ?, ?)',
        [user_id, session_id, 'user', message]
      );
    }

    // 获取对话历史（最近10条）
    let history = [];
    if (user_id) {
      history = await db.query(
        'SELECT role, content FROM chat_history WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 10',
        [user_id, session_id]
      );
      history.reverse();
    }

    const aiResponse = await claude.chat(message, history);

    // 保存 AI 回复
    if (user_id) {
      await db.run(
        'INSERT INTO chat_history (user_id, session_id, role, content) VALUES (?, ?, ?, ?)',
        [user_id, session_id, 'ai', aiResponse]
      );
    }

    res.json({ response: aiResponse, session_id });

  } catch (err) {
    console.error('AI问答失败:', err);
    res.status(500).json({ error: 'AI服务暂时不可用', message: err.message });
  }
});

// 获取对话历史
router.get('/chat/history', async (req, res) => {
  try {
    const { user_id, session_id = 'default', limit = 50 } = req.query;
    if (!user_id) return res.json([]);

    const history = await db.query(
      'SELECT role, content, created_at FROM chat_history WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ?',
      [user_id, session_id, parseInt(limit)]
    );

    res.json(history.reverse());
  } catch (err) {
    console.error('获取对话历史失败:', err);
    res.status(500).json({ error: '获取对话历史失败' });
  }
});

// 清空对话历史
router.delete('/chat/history', async (req, res) => {
  try {
    const { user_id, session_id } = req.body;
    if (session_id) {
      await db.run('DELETE FROM chat_history WHERE user_id = ? AND session_id = ?', [user_id, session_id]);
    } else {
      await db.run('DELETE FROM chat_history WHERE user_id = ?', [user_id]);
    }
    res.json({ message: '清空成功' });
  } catch (err) {
    console.error('清空对话历史失败:', err);
    res.status(500).json({ error: '清空失败' });
  }
});

// 生成练习计划
router.post('/plan', async (req, res) => {
  try {
    const { user_id, level, goals, available_time } = req.body;

    const plan = await claude.generatePlan(level, goals, available_time);

    // 保存到数据库
    if (user_id) {
      await db.run(
        'INSERT INTO practice_plans (user_id, title, description, daily_duration) VALUES (?, ?, ?, ?)',
        [user_id, plan.plan_name, plan.description, available_time || 30]
      );
    }

    res.json(plan);
  } catch (err) {
    console.error('生成练习计划失败:', err);
    res.status(500).json({ error: '生成练习计划失败' });
  }
});

module.exports = router;
