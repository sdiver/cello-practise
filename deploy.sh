#!/bin/bash
# Cello-Practise 智能部署脚本
#
# 用法：
#   ./deploy.sh           — 增量部署（90% 场景，30 秒-1 分钟）
#   ./deploy.sh --full    — 完全重建（依赖大变 / 镜像异常时用，3-8 分钟）
#
# 增量与完全的区别：
#   增量：利用 Docker layer cache，仅重建源码改动相关层
#   完全：--no-cache，全部重新构建（代码 + npm install + native 编译）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FULL_REBUILD=0
if [[ "$1" == "--full" || "$1" == "-f" ]]; then
    FULL_REBUILD=1
fi

START=$(date +%s)
echo "🚀 部署 Cello-Practise（$([[ $FULL_REBUILD -eq 1 ]] && echo '完全重建' || echo '增量构建')）"

# ----------- 1. 拉取最新代码 -----------
echo "📥 git pull..."
if ! git pull 2>/dev/null; then
    echo "⚠️  本地有冲突，自动 stash 后重试"
    git stash
    git pull
    git stash pop || echo "⚠️  本地修改与远程冲突，已用远程版本"
fi

CURRENT_COMMIT=$(git log -1 --format="%h %s")
echo "📌 当前 commit: $CURRENT_COMMIT"

# ----------- 2. 构建 -----------
if [[ $FULL_REBUILD -eq 1 ]]; then
    echo "🛑 停止容器并清除镜像..."
    docker-compose down
    docker rmi cello-practise:latest 2>/dev/null || true
    echo "🏗️  完全重建（无缓存）..."
    docker-compose build --no-cache cello-practise
    docker-compose up -d
else
    # 增量：保留 node_modules 等可缓存层；仅源码改动会触发重建
    echo "🏗️  增量构建（利用 layer cache）..."
    docker-compose up -d --build
fi

# ----------- 3. 等待启动 -----------
echo "⏳ 等待服务就绪..."
for i in {1..15}; do
    sleep 2
    if curl -sf http://localhost:3001/api/health >/dev/null 2>&1; then
        echo "✅ 服务已就绪"
        break
    fi
    if [[ $i -eq 15 ]]; then
        echo "❌ 服务 30 秒内未就绪，查看日志："
        docker-compose logs --tail=50 cello-practise
        exit 1
    fi
done

# ----------- 4. 总结 -----------
ELAPSED=$(($(date +%s) - START))
echo ""
echo "✅ 部署成功！耗时 ${ELAPSED} 秒"
echo "📍 访问: http://$(hostname -I 2>/dev/null | awk '{print $1}'):3001"
echo ""
echo "💡 验证最新代码已生效："
echo "   curl -s http://localhost:3001/ | grep -oE 'index-[^\"]+\\.js' | head -1"
