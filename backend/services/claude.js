const Anthropic = require('@anthropic-ai/sdk').default;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

const SYSTEM_PROMPTS = {
  analyzer: `你是一位资深大提琴教学专家，拥有20年教学经验。你善于根据数据分析学生的演奏表现，并给出精准、鼓励性的专业评价。
你的学生是小朋友（5-15岁），请用温暖鼓励的语气，避免过于严厉的批评。
回答时请使用中文。`,

  coach: `你是一位亲切的大提琴教练，专门教小朋友学琴。你擅长用通俗易懂的语言解释演奏技巧、乐理知识和练习方法。
回答要专业、实用、充满鼓励，语气像一位和蔼的老师。回答控制在200字以内。
回答时请使用中文。`,

  planner: `你是一位资深大提琴教学专家，擅长为小朋友制定个性化的练习计划。
计划要考虑孩子的注意力时长，每个练习项目不超过10分钟，穿插趣味性内容。
回答时请使用中文。`
};

async function callClaude(messages, options = {}) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: options.maxTokens || 2000,
    system: options.system || SYSTEM_PROMPTS.coach,
    messages
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

async function analyzePractice(pitchData, sheetTitle, duration) {
  const notes = pitchData.map(p => p.note).join(', ');
  const avgFreq = pitchData.reduce((sum, p) => sum + (p.frequency || 0), 0) / pitchData.length;

  const prompt = `学生刚刚练习演奏了《${sheetTitle}》。

演奏数据：
- 检测到的音高序列：${notes}
- 平均频率：${avgFreq.toFixed(2)} Hz
- 演奏时长：${duration || '未知'}秒
- 音符数量：${pitchData.length}

请给出专业的演奏评价，以JSON格式回复：
{
  "pitch_score": 0-100的分数,
  "rhythm_score": 0-100的分数,
  "expression_score": 0-100的分数,
  "total_score": 0-100的分数,
  "comment": "点评内容（200字以内，鼓励为主）",
  "suggestions": ["建议1", "建议2", "建议3"]
}

只返回JSON，不要其他内容。`;

  const result = await callClaude(
    [{ role: 'user', content: prompt }],
    { system: SYSTEM_PROMPTS.analyzer, maxTokens: 1000 }
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // fallback
  }

  return {
    pitch_score: 80,
    rhythm_score: 75,
    expression_score: 78,
    total_score: 78,
    comment: result.slice(0, 200),
    suggestions: ['继续保持练习', '注意音准', '加强节奏训练']
  };
}

async function chat(message, history = []) {
  const messages = [
    ...history.map(h => ({
      role: h.role === 'ai' ? 'assistant' : h.role,
      content: h.content
    })),
    { role: 'user', content: message }
  ];

  return callClaude(messages, { system: SYSTEM_PROMPTS.coach });
}

async function generatePlan(level, goals, availableTime) {
  const prompt = `请为一位${level || '初级'}水平的小朋友制定一个大提琴练习计划。

学习目标：${goals || '提高基础技巧'}
每日可用时间：${availableTime || '30'}分钟

请以JSON格式返回一周计划：
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
}

只返回JSON，不要其他内容。`;

  const result = await callClaude(
    [{ role: 'user', content: prompt }],
    { system: SYSTEM_PROMPTS.planner, maxTokens: 2000 }
  );

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // fallback
  }

  return {
    plan_name: '自定义练习计划',
    description: result.slice(0, 200),
    weekly_schedule: []
  };
}

module.exports = { callClaude, analyzePractice, chat, generatePlan, SYSTEM_PROMPTS };
