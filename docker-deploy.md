# Cello-Practise NAS / Docker 部署指南

## 镜像架构

单容器自包含——Dockerfile 多阶段构建：

```
[阶段 1: frontend-builder]  Vite 构建前端 → frontend/dist
[阶段 2: backend-builder]   编译 better-sqlite3 native → node_modules
[阶段 3: runtime]           node:20-alpine + tini，~120MB
```

容器内由后端 Express 同时托管前端静态资源（`/` → `frontend/dist`）和 API（`/api/*`）。

## 数据持久化（host volume）

| 宿主机路径 | 容器路径 | 说明 |
|-----------|---------|------|
| `./uploads` | `/app/uploads` | MIDI / MusicXML / PDF 等用户上传文件 |
| `./data` | `/app/data` | SQLite 数据库（`cello_tutor.db`） |
| `./backend/.env` | `/app/backend/.env` (ro) | 环境变量：API key、端口等 |

## 群晖 / QNAP / UnRAID 部署步骤

### 1. 上传项目代码

通过 git clone 或 File Station 上传到 NAS（推荐路径 `/volume1/docker/cello-practise/`）：

```bash
ssh admin@<NAS-IP>
cd /volume1/docker/
git clone <你的仓库地址> cello-practise
cd cello-practise
```

### 2. 准备环境变量

```bash
# 若仓库未带 .env，复制模板填写
cp backend/.env.example backend/.env
nano backend/.env
```

关键字段：

```ini
PORT=3001
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-...        # AI 助手
CLAUDE_MODEL=claude-sonnet-4-6
MAX_FILE_SIZE=52428800              # 50MB
UPLOAD_DIR=./uploads
```

### 3. 创建挂载目录（首次）

```bash
mkdir -p data uploads/sheets uploads/midi
chown -R 1000:1000 data uploads   # 让容器内 node 用户（uid 1000）能读写
```

### 4. 构建并启动

```bash
docker-compose up -d --build
```

首次构建约需 3-5 分钟（编译 better-sqlite3）。

### 5. 验证

```bash
# 看容器状态
docker-compose ps

# 看启动日志
docker-compose logs -f cello-practise

# 健康检查
curl http://localhost:3001/api/health
```

浏览器访问 `http://<NAS-IP>:3001` 即可。

## 常用运维命令

```bash
# 重启
docker-compose restart cello-practise

# 停止
docker-compose down

# 重建（代码更新后）
git pull
docker-compose up -d --build

# 一键部署脚本（已封装）
./deploy.sh

# 进入容器排查
docker-compose exec cello-practise sh

# 查看实时日志（最近 100 行）
docker-compose logs -f --tail=100 cello-practise

# 备份数据库
cp data/cello_tutor.db data/cello_tutor.db.bak.$(date +%Y%m%d)
```

## 反向代理（可选）

若主公已有 Nginx Proxy Manager / Caddy 接管 NAS 公网访问，可：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # 麦克风权限需 HTTPS，反代上做 SSL
    proxy_set_header X-Forwarded-Proto $scheme;
    # SPA 静态资源缓存
    proxy_buffering on;
}
```

## 端口冲突

默认占用 3001。如冲突，改 `docker-compose.yml`：

```yaml
ports:
  - "13001:3001"   # 宿主 13001 → 容器 3001
```

不必改 PORT 环境变量——容器内仍跑 3001。

## 常见问题

### Q1：构建时 better-sqlite3 编译失败

确保 Dockerfile 阶段 2 装齐了 `python3 make g++ py3-setuptools`（已含）。如 NAS 内存小（< 1GB），可在外部预编译再 docker save：

```bash
# 性能较强机器上预编译
docker save cello-practise:latest -o cello-practise.tar
# 拷到 NAS
docker load -i cello-practise.tar
```

### Q2：上传文件 / 数据库丢失

确认 `docker-compose.yml` 的 volume 段配置正确，且宿主目录权限允许容器内 uid 1000 读写。

### Q3：麦克风（跟练功能）无法访问

浏览器要求 HTTPS 才允许 `getUserMedia`。NAS 部署后须加 SSL 反代。本机 `localhost:3001` 例外，可不加 SSL。

### Q4：容器内时区不对

已设 `TZ=Asia/Shanghai`，如需其他时区改 docker-compose.yml。
