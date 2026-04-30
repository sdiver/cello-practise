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

# 装依赖——package*.json 不变时整层走 docker layer cache 跳过
COPY frontend/package*.json ./
RUN npm ci --prefer-offline

# 拷源码构建——src 改动仅重建本层
COPY frontend/ ./
RUN npm run build

# ============================================================
# 阶段 2：后端 production 依赖（含 better-sqlite3 原生编译）
# ============================================================
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

# 编译工具链——独立一层，apk 缓存命中
RUN apk add --no-cache python3 make g++ py3-setuptools

ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    BETTER_SQLITE3_BINARY_HOST_MIRROR=https://registry.npmmirror.com/-/binary/better-sqlite3 \
    SQLITE3_BINARY_HOST_MIRROR=https://registry.npmmirror.com/-/binary/sqlite3 \
    npm_config_better_sqlite3_binary_host=https://registry.npmmirror.com/-/binary/better-sqlite3

COPY backend/package*.json ./
RUN npm ci --omit=dev --prefer-offline

# ============================================================
# 阶段 3：运行时镜像（最小化）
# ============================================================
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache wget tini

# 先拷 node_modules（变化少），再拷源码（变化频繁）——优化 layer cache
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/

# 前端构建产物
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 数据/上传目录（host volume 挂载会覆盖）
RUN mkdir -p /app/data /app/uploads/sheets /app/uploads/midi \
 && chown -R node:node /app/data /app/uploads

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
WORKDIR /app/backend
CMD ["node", "server.js"]
