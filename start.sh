#!/bin/bash

# AI 大提琴私教 - 启动脚本

echo "🎻 启动 AI 大提琴私教系统..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到 Node.js，请先安装"
    exit 1
fi

# 进入后端目录
cd backend

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 复制环境变量文件
if [ ! -f ".env" ]; then
    echo "⚙️  创建环境变量文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件配置 LLM API"
fi

# 启动服务器
echo "🚀 启动服务器..."
echo ""
echo "服务将在以下地址运行："
echo "  - 网站: http://localhost:3000"
echo "  - API: http://localhost:3000/api"
echo ""

npm start
