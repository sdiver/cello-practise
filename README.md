# AI 大提琴私教 - 智能陪练系统

一个完整的 AI 驱动的大提琴练习平台，包含前端、后端和数据库。

## 功能特性

- 🎵 **专业调音器** - YIN 算法音高检测，支持四弦调音
- 🎯 **AI 陪练** - 实时录音分析，AI 智能评分
- 📚 **琴谱库** - 本地 + 联网搜索（IMSLP、Bilibili）
- 📊 **进度追踪** - 练习数据统计和可视化
- 💬 **AI 问答** - 接入本地 Qwen3.5-9B 模型
- 📅 **练习计划** - 智能生成个性化练习计划
- 👤 **用户系统** - 多用户支持，个人设置

## 技术栈

- **前端**: HTML5, CSS3, JavaScript (原生)
- **后端**: Node.js + Express
- **数据库**: SQLite3
- **AI**: Ollama (Qwen3.5-9B)
- **其他**: OpenSheetMusicDisplay (乐谱渲染), Chart.js (图表)

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置 LLM API 等
```

### 3. 启动服务器

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

服务器将在 http://localhost:3000 启动

### 4. 访问网站

打开浏览器访问 http://localhost:3000

## 项目结构

```
cello-practise/
├── backend/           # 后端代码
│   ├── routes/        # API 路由
│   ├── models/        # 数据库模型
│   ├── middleware/    # 中间件
│   ├── services/      # 业务逻辑
│   ├── server.js      # 主入口
│   └── package.json
├── frontend/          # 前端代码
│   ├── css/           # 样式文件
│   ├── js/            # JavaScript
│   └── pages/         # HTML 页面
├── uploads/           # 上传文件存储
│   └── sheets/        # 琴谱文件
├── data/              # SQLite 数据库
└── README.md
```

## API 文档

### 琴谱管理
- `GET /api/sheets` - 获取琴谱列表
- `GET /api/sheets/:id` - 获取单张琴谱
- `POST /api/sheets/upload` - 上传琴谱
- `POST /api/sheets/save` - 保存网络琴谱
- `DELETE /api/sheets/:id` - 删除琴谱

### 搜索
- `GET /api/search/sheets?q=关键词` - 搜索琴谱
- `GET /api/search/history` - 搜索历史
- `GET /api/search/trending` - 热门搜索

### AI
- `POST /api/ai/analyze` - 分析演奏
- `POST /api/ai/chat` - AI 问答
- `POST /api/ai/plan` - 生成练习计划

### 练习记录
- `GET /api/practice/records` - 练习记录
- `GET /api/practice/stats` - 统计数据
- `GET /api/practice/plans` - 练习计划

### 用户
- `POST /api/users/login` - 登录/注册
- `GET /api/users/:id` - 用户信息
- `PUT /api/users/:id/settings` - 更新设置

## 配置说明

### LLM 配置
编辑 `backend/.env`：
```
LLM_API_URL=http://10.147.20.22:11434/v1/chat/completions
LLM_MODEL=qwen3.5-9b
```

### YouTube API (可选)
获取 YouTube Data API v3 Key 并配置：
```
YOUTUBE_API_KEY=your_key_here
```

## 开发计划

- [ ] 用户认证系统（JWT）
- [ ] 更多琴谱源集成
- [ ] 实时音频流传输
- [ ] 移动端 App
- [ ] 社交功能（分享、评论）

## License

MIT
