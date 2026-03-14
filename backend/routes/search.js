const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('../models/db');

// 搜索琴谱（联网）
router.get('/sheets', async (req, res) => {
  try {
    const { q, source = 'all', page = 1, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: '请输入搜索关键词' });
    }

    // 保存搜索历史
    if (req.query.user_id) {
      await db.run(
        'INSERT INTO search_history (user_id, keyword, source) VALUES (?, ?, ?)',
        [req.query.user_id, q, source]
      );
    }

    const results = [];

    // 1. 搜索本地数据库
    const localSheets = await db.query(
      `SELECT *, 'local' as source_type FROM sheets
       WHERE title LIKE ? OR composer LIKE ?
       ORDER BY download_count DESC LIMIT ?`,
      [`%${q}%`, `%${q}%`, parseInt(limit)]
    );
    results.push(...localSheets);

    // 2. 搜索 IMSLP（国际乐谱图书馆）
    if (source === 'all' || source === 'imslp') {
      try {
        const imslpResults = await searchIMSLP(q, parseInt(limit));
        results.push(...imslpResults);
      } catch (err) {
        console.error('IMSLP 搜索失败:', err);
      }
    }

    // 3. 搜索 Bilibili 视频教程
    if (source === 'all' || source === 'bilibili') {
      try {
        const bilibiliResults = await searchBilibili(q, parseInt(limit));
        results.push(...bilibiliResults);
      } catch (err) {
        console.error('Bilibili 搜索失败:', err);
      }
    }

    // 4. 搜索 YouTube
    if (source === 'all' || source === 'youtube') {
      try {
        const youtubeResults = await searchYouTube(q, parseInt(limit));
        results.push(...youtubeResults);
      } catch (err) {
        console.error('YouTube 搜索失败:', err);
      }
    }

    res.json({
      query: q,
      source,
      total: results.length,
      data: results
    });

  } catch (err) {
    console.error('搜索失败:', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

// 搜索 IMSLP
async function searchIMSLP(query, limit) {
  const results = [];

  try {
    // IMSLP API 搜索
    const searchUrl = `https://imslp.org/imslpscripts/API.ISCR.php?account=worklist\&type=2\&query=${encodeURIComponent(query)}\&retformat=json`;

    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (response.data && response.data.length > 0) {
      const works = Array.isArray(response.data) ? response.data.slice(0, limit) : [];

      for (const work of works) {
        results.push({
          id: `imslp-${work.id || Math.random().toString(36)}`,
          title: work.title || 'Unknown',
          composer: work.composer || 'Unknown',
          source: 'IMSLP',
          source_url: `https://imslp.org/wiki/${encodeURIComponent(work.title || '')}`,
          source_type: 'imslp',
          difficulty: 'intermediate',
          is_downloaded: false,
          thumbnail: null,
          metadata: {
            work_id: work.id,
            composer: work.composer,
            year: work.year
          }
        });
      }
    }
  } catch (err) {
    console.error('IMSLP API 搜索失败:', err.message);
  }

  // 如果 API 失败，使用备用方案：返回模拟数据或网页抓取
  if (results.length === 0) {
    return getMockIMSLPResults(query, limit);
  }

  return results;
}

// IMSLP 备用结果
function getMockIMSLPResults(query, limit) {
  const celloWorks = [
    { title: '6 Cello Suites, BWV 1007-1012', composer: 'Johann Sebastian Bach' },
    { title: 'Cello Concerto in B minor, Op. 104', composer: 'Antonín Dvořák' },
    { title: 'Cello Concerto in E minor, Op. 85', composer: 'Edward Elgar' },
    { title: 'Sonata for Cello and Piano in G minor, Op. 65', composer: 'Frédéric Chopin' },
    { title: 'Variations on a Rococo Theme, Op. 33', composer: 'Pyotr Tchaikovsky' },
    { title: 'Suzuki Cello School, Vol. 1', composer: 'Shinichi Suzuki' },
    { title: 'Suzuki Cello School, Vol. 2', composer: 'Shinichi Suzuki' },
    { title: 'Suzuki Cello School, Vol. 3', composer: 'Shinichi Suzuki' },
    { title: 'Concerto for Cello and Orchestra', composer: 'Camille Saint-Saëns' },
    { title: 'Apologize (Cello Cover)', composer: 'OneRepublic' }
  ];

  const lowerQuery = query.toLowerCase();
  const filtered = celloWorks.filter(w =>
    w.title.toLowerCase().includes(lowerQuery) ||
    w.composer.toLowerCase().includes(lowerQuery)
  );

  return filtered.slice(0, limit).map((work, i) => ({
    id: `imslp-mock-${i}`,
    title: work.title,
    composer: work.composer,
    source: 'IMSLP',
    source_url: `https://imslp.org/wiki/${encodeURIComponent(work.title)}`,
    source_type: 'imslp',
    difficulty: 'intermediate',
    is_downloaded: false,
    thumbnail: null,
    metadata: { composer: work.composer }
  }));
}

// 搜索 Bilibili
async function searchBilibili(query, limit) {
  const results = [];

  try {
    const searchQuery = `大提琴 ${query}`;
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video\&keyword=${encodeURIComponent(searchQuery)}\&page=1\&pagesize=${limit}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://search.bilibili.com'
      },
      timeout: 10000
    });

    if (response.data && response.data.data && response.data.data.result) {
      const videos = response.data.data.result;

      for (const video of videos) {
        results.push({
          id: `bilibili-${video.bvid}`,
          title: video.title.replace(/<[^>]+>/g, ''), // 去除 HTML 标签
          composer: video.author,
          source: 'Bilibili',
          source_url: `https://www.bilibili.com/video/${video.bvid}`,
          source_type: 'bilibili',
          difficulty: 'beginner',
          is_downloaded: false,
          thumbnail: video.pic,
          video_id: video.bvid,
          metadata: {
            duration: video.duration,
            view_count: video.play,
            author: video.author,
            description: video.description
          }
        });
      }
    }
  } catch (err) {
    console.error('Bilibili 搜索失败:', err.message);
  }

  return results;
}

// 搜索 YouTube
async function searchYouTube(query, limit) {
  const results = [];

  // YouTube 需要 API Key，这里提供模拟数据作为示例
  // 实际使用时需要配置 YOUTUBE_API_KEY
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    console.log('未配置 YouTube API Key，跳过 YouTube 搜索');
    return [];
  }

  try {
    const searchQuery = `cello ${query}`;
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet\&q=${encodeURIComponent(searchQuery)}\&type=video\&maxResults=${limit}\&key=${apiKey}`;

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.items) {
      for (const item of response.data.items) {
        results.push({
          id: `youtube-${item.id.videoId}`,
          title: item.snippet.title,
          composer: item.snippet.channelTitle,
          source: 'YouTube',
          source_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
          source_type: 'youtube',
          difficulty: 'intermediate',
          is_downloaded: false,
          thumbnail: item.snippet.thumbnails.medium?.url,
          video_id: item.id.videoId,
          metadata: {
            published_at: item.snippet.publishedAt,
            channel: item.snippet.channelTitle,
            description: item.snippet.description
          }
        });
      }
    }
  } catch (err) {
    console.error('YouTube 搜索失败:', err.message);
  }

  return results;
}

// 获取搜索历史
router.get('/history', async (req, res) => {
  try {
    const { user_id, limit = 20 } = req.query;

    if (!user_id) {
      return res.json([]);
    }

    const history = await db.query(
      `SELECT keyword, source, created_at,
        (SELECT COUNT(*) FROM search_history h2 WHERE h2.keyword = h1.keyword) as search_count
       FROM search_history h1
       WHERE user_id = ?
       GROUP BY keyword
       ORDER BY MAX(created_at) DESC
       LIMIT ?`,
      [user_id, parseInt(limit)]
    );

    res.json(history);
  } catch (err) {
    console.error('获取搜索历史失败:', err);
    res.status(500).json({ error: '获取搜索历史失败' });
  }
});

// 清除搜索历史
router.delete('/history', async (req, res) => {
  try {
    const { user_id } = req.body;
    await db.run('DELETE FROM search_history WHERE user_id = ?', [user_id]);
    res.json({ message: '清除成功' });
  } catch (err) {
    console.error('清除搜索历史失败:', err);
    res.status(500).json({ error: '清除搜索历史失败' });
  }
});

// 热门搜索
router.get('/trending', async (req, res) => {
  try {
    const trending = await db.query(
      `SELECT keyword, COUNT(*) as count
       FROM search_history
       WHERE created_at >= date('now', '-7 days')
       GROUP BY keyword
       ORDER BY count DESC
       LIMIT 10`
    );

    res.json(trending);
  } catch (err) {
    console.error('获取热门搜索失败:', err);
    res.status(500).json({ error: '获取热门搜索失败' });
  }
});

// 获取 IMSLP 作品详情（包含文件列表）
router.get('/imslp/work/:workId', async (req, res) => {
  try {
    const { workId } = req.params;

    // 调用 IMSLP API 获取作品详情
    const apiUrl = `https://imslp.org/imslpscripts/API.ISCR.php?account=worklist\&type=2\&query=${encodeURIComponent(workId)}\&retformat=json`;

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    if (!response.data || response.data.length === 0) {
      return res.status(404).json({ error: '作品未找到' });
    }

    const work = response.data.find(w => w.id === workId || w.intvals?.work === workId);

    if (!work) {
      return res.status(404).json({ error: '作品未找到' });
    }

    // 获取作品页面解析文件列表
    const files = await getIMSLPFiles(work.id);

    res.json({
      work: {
        id: work.id,
        title: work.title,
        composer: work.composer,
        year: work.year,
        url: `https://imslp.org/wiki/${encodeURIComponent(work.title || '')}`
      },
      files
    });

  } catch (err) {
    console.error('获取 IMSLP 作品详情失败:', err);
    res.status(500).json({ error: '获取作品详情失败' });
  }
});

// 解析 IMSLP 页面获取文件列表
async function getIMSLPFiles(workId) {
  const files = [];

  try {
    // 使用 IMSLP 的文件 API
    const url = `https://imslp.org/imslpscripts/API.ISCR.php?account=filelist\&type=2\多个workid=${workId}\&retformat=json`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    if (response.data && Array.isArray(response.data)) {
      for (const file of response.data) {
        const fileName = file.filename || file.file || '';
        const ext = fileName.split('.').pop().toLowerCase();

        if (['xml', 'mxl', 'musicxml'].includes(ext)) {
          files.push({
            id: file.id,
            filename: fileName,
            type: 'musicxml',
            url: `https://imslp.org/wiki/Special:IMSLPDisclaimerAccept/${file.id}`,
            size: file.size,
            description: file.desc || ''
          });
        } else if (['pdf'].includes(ext)) {
          files.push({
            id: file.id,
            filename: fileName,
            type: 'pdf',
            url: `https://imslp.org/wiki/Special:IMSLPDisclaimerAccept/${file.id}`,
            size: file.size,
            description: file.desc || ''
          });
        }
      }
    }
  } catch (err) {
    console.error('获取 IMSLP 文件列表失败:', err.message);
  }

  return files;
}

// 代理下载 IMSLP MusicXML 文件
router.get('/download/imslp/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { title } = req.query;

    // 构造 IMSLP 下载链接
    const downloadUrl = `https://imslp.org/wiki/Special:IMSLPDisclaimerAccept/${fileId}`;

    // 先获取免责声明页面，然后获取实际文件
    const disclaimerResponse = await axios.get(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000,
      maxRedirects: 5
    });

    // 解析页面获取实际下载链接
    const $ = cheerio.load(disclaimerResponse.data);
    const actualLink = $('a[href*="score"]').attr('href') || $('a.external').attr('href');

    if (!actualLink) {
      return res.status(404).json({ error: '无法获取下载链接' });
    }

    // 下载文件
    const fileResponse = await axios.get(actualLink, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5
    });

    // 确定文件名
    const contentDisposition = fileResponse.headers['content-disposition'];
    let filename = title ? `${title}.mxl` : `music-${fileId}.mxl`;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    }

    // 设置响应头
    res.setHeader('Content-Type', fileResponse.headers['content-type'] || 'application/vnd.recordare.musicxml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(fileResponse.data);

  } catch (err) {
    console.error('下载 IMSLP 文件失败:', err);
    res.status(500).json({ error: '下载失败: ' + err.message });
  }
});

module.exports = router;
