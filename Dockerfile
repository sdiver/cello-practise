# ============================================================
# 阶段 1：构建前端（Vite + Vue + TypeScript）
# ============================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# 国内镜像源 + 网络优化（NAS 直连 npmjs.org 易超时）
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

# 先装依赖（利用 Docker 缓存层）
COPY frontend/package*.json ./
RUN npm ci

# 拷贝源码构建
COPY frontend/ ./
RUN npm run build

# ============================================================
# 阶段 2：安装后端 production 依赖（含 better-sqlite3 原生编译）
# ============================================================
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

# 编译 native 模块需要的工具链
RUN apk add --no-cache python3 make g++ py3-setuptools

# 国内镜像源 + better-sqlite3 prebuild 二进制走淘宝镜像
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    BETTER_SQLITE3_BINARY_HOST_MIRROR=https://registry.npmmirror.com/-/binary/better-sqlite3 \
    SQLITE3_BINARY_HOST_MIRROR=https://registry.npmmirror.com/-/binary/sqlite3 \
    npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3

COPY backend/package*.json ./
RUN npm ci --omit=dev

# ============================================================
# 阶段 3：运行时镜像（最小化）
# ============================================================
FROM node:20-alpine
WORKDIR /app

# 运行时需要：wget（健康检查）、tini（信号转发，正确处理 SIGTERM）
RUN apk add --no-cache wget tini

# 拷贝后端代码 + production node_modules（已编译好 sqlite3）
COPY backend/ ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# 拷贝前端构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 容器内默认数据/上传目录（docker-compose volumes 会挂载宿主目录覆盖）
RUN mkdir -p /app/data /app/uploads/sheets /app/uploads/midi \
 && chown -R node:node /app/data /app/uploads

# 切换到非 root 用户
USER node

EXPOSE 3001

# 健康检查：探测 /api/health
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# 用 tini 做 PID 1，确保 docker stop 能优雅终止
ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /app/backend
CMD ["node", "server.js"]
