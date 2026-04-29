const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'cello_tutor.db');

// 确保数据目录存在
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db = null;

function getDB() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('数据库连接失败:', err);
      } else {
        console.log('数据库连接成功');
      }
    });

    // 启用外键约束
    db.run('PRAGMA foreign_keys = ON');
  }
  return db;
}

function init() {
  return new Promise((resolve, reject) => {
    const database = getDB();

    const tables = [
      // 用户表
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        nickname TEXT,
        avatar TEXT,
        level INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 琴谱表
      `CREATE TABLE IF NOT EXISTS sheets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        composer TEXT,
        difficulty TEXT CHECK(difficulty IN ('beginner', 'intermediate', 'advanced')),
        source TEXT,
        source_url TEXT,
        local_path TEXT,
        midi_path TEXT,
        xml_path TEXT,
        file_type TEXT,
        file_size INTEGER,
        is_downloaded BOOLEAN DEFAULT 0,
        download_count INTEGER DEFAULT 0,
        user_id INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // 练习记录表
      `CREATE TABLE IF NOT EXISTS practice_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        sheet_id INTEGER,
        practice_date DATE DEFAULT CURRENT_DATE,
        duration INTEGER,
        pitch_score INTEGER,
        rhythm_score INTEGER,
        expression_score INTEGER,
        total_score INTEGER,
        ai_feedback TEXT,
        audio_path TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (sheet_id) REFERENCES sheets(id)
      )`,

      // 练习计划表
      `CREATE TABLE IF NOT EXISTS practice_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        sheet_ids TEXT,
        start_date DATE,
        end_date DATE,
        daily_duration INTEGER,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'paused')),
        progress INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // 收藏表
      `CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        sheet_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (sheet_id) REFERENCES sheets(id),
        UNIQUE(user_id, sheet_id)
      )`,

      // 搜索历史表
      `CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        keyword TEXT NOT NULL,
        source TEXT,
        result_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // AI 对话历史表
      `CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT,
        role TEXT CHECK(role IN ('user', 'ai')),
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,

      // 设置表
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        tuner_reference REAL DEFAULT 440,
        theme TEXT DEFAULT 'dark',
        language TEXT DEFAULT 'zh-CN',
        notification_enabled BOOLEAN DEFAULT 1,
        ai_model_endpoint TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`
    ];

    let completed = 0;
    tables.forEach(sql => {
      database.run(sql, (err) => {
        if (err) {
          console.error('创建表失败:', err);
          reject(err);
        } else {
          completed++;
          if (completed === tables.length) {
            console.log('所有表创建成功');
            // 兼容旧库：补加 midi_path / xml_path 字段（已存在则忽略错误）
            database.run(`ALTER TABLE sheets ADD COLUMN midi_path TEXT`, () => {});
            database.run(`ALTER TABLE sheets ADD COLUMN xml_path TEXT`, () => {});
            // 创建默认用户
            createDefaultUser().then(() => resolve()).catch(reject);
          }
        }
      });
    });
  });
}

// 创建默认用户
async function createDefaultUser() {
  try {
    const existingUser = await get('SELECT id FROM users WHERE id = 1');
    if (!existingUser) {
      await run(
        'INSERT INTO users (id, username, nickname) VALUES (?, ?, ?)',
        [1, 'cellist', '大提琴练习者']
      );
      console.log('默认用户已创建');
    }
  } catch (err) {
    console.error('创建默认用户失败:', err);
  }
}

// 查询辅助函数
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDB().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

module.exports = {
  init,
  query,
  run,
  get,
  getDB
};
