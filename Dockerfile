# 使用官方 Node.js 轻量级镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app/backend

# 复制 backend 的 package.json
COPY backend/package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制后端代码
COPY backend/ ./

# 复制前端静态文件和上传目录
COPY frontend/ ../frontend/
COPY uploads/ ../uploads/

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/sheets || exit 1

# 启动应用（从 backend 目录启动）
CMD ["node", "server.js"]
