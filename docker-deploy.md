# Cello Practise Docker 部署指南

## 项目结构说明

- `backend/` - Node.js 后端服务
- `frontend/` - 静态前端文件
- `uploads/` - 上传文件存储目录
- `data/` - 数据库文件存储目录

## 快速开始

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f cello-practise
```

## 群晖 Container Manager 部署

1. **上传项目到群晖**
   ```
   /docker/cello-practise/
   ├── backend/
   ├── frontend/
   ├── uploads/
   ├── data/
   ├── Dockerfile
   └── docker-compose.yml
   ```

2. **创建必要目录**
   ```bash
   mkdir -p /volume1/docker/cello-practise/data
   mkdir -p /volume1/docker/cello-practise/uploads
   ```

3. **配置环境变量**
   - 复制 `backend/.env.example` 为 `backend/.env`
   - 修改配置（如 API 密钥等）

4. **启动容器**
   ```bash
   cd /volume1/docker/cello-practise
   sudo docker-compose up -d
   ```

## 端口

- 3001：应用访问端口
- 访问地址：`http://群晖IP:3001`

## 数据持久化

| 宿主机路径 | 容器路径 | 说明 |
|-----------|---------|------|
| ./uploads | /app/uploads | 上传的乐谱文件 |
| ./data | /app/data | SQLite 数据库 |
| ./backend/.env | /app/backend/.env | 配置文件 |

## 更新应用

```bash
git pull
sudo docker-compose build --no-cache
sudo docker-compose up -d
```

## 常见问题

1. **上传文件丢失** - 确保 `uploads` 目录已正确挂载
2. **数据库重置** - 确保 `data` 目录已正确挂载
