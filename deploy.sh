#!/bin/bash
# Cello-Practise 项目部署脚本
# 用法: ./deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 开始部署 Cello-Practise..."

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull

# 停止并删除旧容器
echo "🛑 停止旧容器..."
docker-compose down

# 重新构建并启动
echo "🏗️  重新构建并启动..."
docker-compose up -d --build

# 等待服务启动
sleep 3

# 检查状态
if docker ps | grep -q "cello-practise"; then
    echo "✅ Cello-Practise 部署成功!"
    echo "📍 直接访问: http://$(hostname -I | awk '{print $1}'):3001"
    echo "📍 通过 Portal 访问: http://$(hostname -I | awk '{print $1}'):8080/portal-home/app/cello-practise"
else
    echo "❌ Cello-Practise 部署失败，请检查日志:"
    docker-compose logs --tail=50
    exit 1
fi
