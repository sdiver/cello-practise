const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../models/db');

// 调用本地 LLM
async function callLocalLLM(messages, model = 'qwen3.5-9b') {
  const apiUrl = process.env.LLM_API_URL || 'http://10.147.20.22:11434/v1/chat/completions';

  try {
    const response = await axios.post(apiUrl, {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000,
      stream: false
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    }

    throw new Error('Invalid response from LLM');
  } catch (err) {
    console.error('LLM调用失败:', err.message);
    throw err;
  }
}

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

    // 准备分析数据
    const notes = pitch_data.map(p => p.note).join(', ');
    const avgFreq = pitch_data.reduce((sum, p) => sum + (p.frequency || 0), 0) / pitch_data.length;

    const prompt = `你是一位专业的大提琴私教。学生刚刚练习演奏了《${sheetTitle}》。

演奏数据：
- 检测到的音高序列：${notes}
- 平均频率：${avgFreq.toFixed(2)} Hz
- 演奏时长：${duration || '未知'}秒
- 音符数量：${pitch_data.length}

请给出专业的演奏评价，包含：
1. 音准评分(0-100)
2. 节奏评分(0-100)
3. 表现力评分(0-100)
4. 总体评分(0-100)
5. 具体点评(200字以内，指出优点和需要改进的地方)
6. 练习建议(3-5条具体可执行的建议)

请以JSON格式回复：
{
  "pitch_score": 分数,
  "rhythm_score": 分数,
  "expression_score": 分数,
  "total_score": 分数,
  "comment": "点评内容",
  "suggestions": ["建议1", "建议2", "建议3"]
}`;

    const aiResponse = await callLocalLLM([
      { role: 'system', content: '你是一位资深大提琴教学专家，拥有20年教学经验。你善于根据数据分析学生的演奏表现，并给出精准、鼓励性的专业评价。' },
      { role: 'user', content: prompt }
    ]);

    // 解析JSON响应
    let result;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (e) {
      // 如果解析失败，使用默认格式
      result = {
        pitch_score: 80,
        rhythm_score: 75,
        expression_score: 78,
        total_score: 78,
        comment: aiResponse.slice(0, 200),
        suggestions: ['继续保持练习', '注意音准', '加强节奏训练']
      };
    }

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
        pitch_score: 80,
        rhythm_score: 75,
        expression_score: 78,
        total_score: 78,
        comment: 'AI服务暂时不可用，这是基于检测数据的默认评价。',
        suggestions: ['检查网络连接', '稍后再试']
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

    // 准备消息
    const messages = [
      { role: 'system', content: '你是一位资深大提琴教学专家，拥有20年教学经验。你擅长回答关于大提琴演奏技巧、乐理知识、练习方法等问题。回答要专业、实用、鼓励性，并且简洁明了（200字以内）。' },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    const aiResponse = await callLocalLLM(messages);

    // 保存 AI 回复
    if (user_id) {
      await db.run(
        'INSERT INTO chat_history (user_id, session_id, role, content) VALUES (?, ?, ?, ?)',
        [user_id, session_id, 'ai', aiResponse]
      );
    }

    res.json({
      response: aiResponse,
      session_id
    });

  } catch (err) {
    console.error('AI问答失败:', err);
    res.status(500).json({
      error: 'AI服务暂时不可用',
      message: err.message
    });
  }
});

// 获取对话历史
router.get('/chat/history', async (req, res) => {
  try {
    const { user_id, session_id = 'default', limit = 50 } = req.query;

    if (!user_id) {
      return res.json([]);
    }

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

    const prompt = `请为一位${level || '初级'}水平的大提琴学习者制定一个练习计划。

学习目标：${goals || '提高基础技巧'}
每日可用时间：${available_time || '30'}分钟

请制定一个包含以下内容的一周练习计划：
1. 每天的练习内容
2. 练习时长分配
3. 重点练习曲目或技巧
4. 每日目标

请以JSON格式返回：
{
  "plan_name": "计划名称",
  "description": "计划描述",
  "weekly_schedule": [
    {
      "day": "周一",
      "focus": "练习重点",
      "items": ["练习项目1", "练习项目2"],
      "duration": "分钟数"
    }
  ]
}`;

    const aiResponse = await callLocalLLM([
      { role: 'system', content: '你是一位资深大提琴教学专家，擅长制定个性化的练习计划。' },
      { role: 'user', content: prompt }
    ]);

    let plan;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      plan = {
        plan_name: '自定义练习计划',
        description: aiResponse.slice(0, 200),
        weekly_schedule: []
      };
    }

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
