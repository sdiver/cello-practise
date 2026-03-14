const axios = require('axios');
const cheerio = require('cheerio');

/**
 * 解析 MuseScore 链接
 * @param {string} url - MuseScore 链接，如 https://musescore.com/user/123/scores/456
 * @returns {Object} 琴谱信息
 */
async function parseMuseScoreUrl(url) {
  // 验证 URL 格式
  const scoreIdMatch = url.match(/musescore\.com\/(?:user\/\d+\/scores\/)?(\d+)/);
  if (!scoreIdMatch) {
    throw new Error('无效的 MuseScore 链接格式');
  }

  const scoreId = scoreIdMatch[1];

  try {
    // 获取页面内容 - 使用更完整的浏览器 Headers
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Pragma': 'no-cache',
      },
      timeout: 20000,
      maxRedirects: 5,
      decompress: true
    });

    const $ = cheerio.load(response.data);

    // 提取元数据
    const title = $('h1').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  'Unknown Title';

    const composer = $('a[href*="/composer/"]').first().text().trim() ||
                     $('.score-info__composer').text().trim() ||
                     'Unknown Composer';

    const description = $('meta[property="og:description"]').attr('content') ||
                        $('.score-info__description').text().trim() ||
                        '';

    const thumbnail = $('meta[property="og:image"]').attr('content') ||
                      $('img.score-thumbnail').attr('src') ||
                      null;

    // 提取页面中的 JSON-LD 数据
    let jsonLdData = {};
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data['@type'] === 'MusicComposition' || data['@type'] === 'CreativeWork') {
          jsonLdData = data;
        }
      } catch (e) {
        // 忽略解析错误
      }
    });

    // 获取难度信息
    const difficulty = $('.score-info__difficulty').text().trim() ||
                       jsonLdData.difficulty ||
                       'intermediate';

    // 获取页面信息
    const pageCount = $('.score-info__pages').text().match(/(\d+)\s*pages?/)?.[1] ||
                      null;

    // 获取标签/分类
    const tags = [];
    $('.score-tags__tag, a[href*="/tags/"]').each((i, el) => {
      const tag = $(el).text().trim();
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    });

    return {
      id: `musescore-${scoreId}`,
      title: title.replace(/\s+/g, ' '),
      composer: composer || 'Unknown Composer',
      description: description.slice(0, 500),
      source: 'MuseScore',
      source_url: url,
      source_type: 'musescore',
      thumbnail: thumbnail,
      difficulty: mapDifficulty(difficulty),
      page_count: pageCount ? parseInt(pageCount) : null,
      tags: tags.slice(0, 10),
      metadata: {
        score_id: scoreId,
        json_ld: jsonLdData,
        crawled_at: new Date().toISOString()
      },
      is_downloaded: false
    };

  } catch (err) {
    console.error('爬取 MuseScore 失败:', err.message);
    throw new Error(`爬取失败: ${err.message}`);
  }
}

/**
 * 映射难度等级
 */
function mapDifficulty(difficulty) {
  const diff = difficulty?.toString().toLowerCase() || '';
  if (diff.includes('beginner') || diff.includes('easy') || diff.includes('1')) {
    return 'beginner';
  }
  if (diff.includes('advanced') || diff.includes('hard') || diff.includes('expert') || diff.includes('3')) {
    return 'advanced';
  }
  return 'intermediate';
}

/**
 * 获取推荐的大提琴琴谱
 * 从 MuseScore 热门大提琴琴谱中爬取
 */
async function getRecommendedCelloSheets(limit = 10) {
  const recommendations = [
    {
      url: 'https://musescore.com/user/180811/scores/141311',
      title: 'Bach Cello Suite No.1 Prelude',
      composer: 'Johann Sebastian Bach'
    },
    {
      url: 'https://musescore.com/user/156231/scores/107191',
      title: 'The Swan (Le Cygne)',
      composer: 'Camille Saint-Saëns'
    },
    {
      url: 'https://musescore.com/user/293928/scores/162614',
      title: 'Canon in D for Cello',
      composer: 'Johann Pachelbel'
    },
    {
      url: 'https://musescore.com/user/123456/scores/789012',
      title: 'Ave Maria for Cello',
      composer: 'Franz Schubert'
    },
    {
      url: 'https://musescore.com/user/789012/scores/345678',
      title: 'Cello Concerto in E minor',
      composer: 'Edward Elgar'
    }
  ];

  const results = [];

  // 随机选择几个进行爬取（避免过多请求）
  const selected = recommendations
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(limit, recommendations.length));

  for (const item of selected) {
    try {
      const sheet = await parseMuseScoreUrl(item.url);
      results.push(sheet);
      // 添加延迟避免请求过快
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`爬取 ${item.url} 失败:`, err.message);
    }
  }

  return results;
}

/**
 * 验证 MuseScore URL 是否有效
 */
function isValidMuseScoreUrl(url) {
  return /^https?:\/\/musescore\.com\/.+/.test(url);
}

module.exports = {
  parseMuseScoreUrl,
  getRecommendedCelloSheets,
  isValidMuseScoreUrl,
  mapDifficulty
};
