const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const md5 = require('md5');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const DOWNLOAD_DIR = path.join(__dirname, '../../uploads/midi');

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * 用 Playwright 打开 MuseScore 页面，绕过 Cloudflare，
 * 提取 score ID + suffix，然后调用 jmuse API 下载 MIDI
 */
async function downloadMidi(url) {
  if (!url.includes('musescore.com')) {
    throw new Error('请提供有效的 MuseScore 链接');
  }

  console.log('[MuseScore] 启动浏览器...');
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    // 拦截网络请求和响应
    let capturedMidiUrl = null;
    let capturedMp3Auth = null;  // 捕获 mp3 请求的 auth，它是有效的

    page.on('request', req => {
      const reqUrl = req.url();
      if (reqUrl.includes('/api/jmuse') && reqUrl.includes('type=mp3')) {
        capturedMp3Auth = req.headers()['authorization'];
        console.log('[MuseScore] 捕获 mp3 auth:', capturedMp3Auth);
      }
    });

    page.on('response', async resp => {
      const reqUrl = resp.url();
      if (reqUrl.includes('/api/jmuse')) {
        console.log('[MuseScore] jmuse 响应:', reqUrl.substring(0, 80), 'status:', resp.status());
        if (resp.status() === 200) {
          try {
            const json = await resp.json();
            if (json?.info?.url) {
              if (reqUrl.includes('type=midi')) {
                capturedMidiUrl = json.info.url;
                console.log('[MuseScore] 捕获到 MIDI URL!');
              }
            }
          } catch {}
        }
      }
    });

    // 打开页面，等待 Cloudflare 通过
    console.log('[MuseScore] 打开页面:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待 Cloudflare 验证通过
    for (let i = 0; i < 10; i++) {
      const title = await page.title();
      console.log(`[MuseScore] 页面标题 (${i}):`, title);
      if (!title.includes('moment') && !title.includes('Cloudflare')) break;
      await page.waitForTimeout(3000);
    }

    // 确保页面真正加载
    await page.waitForTimeout(2000);

    // 从页面提取 score ID 和标题
    const pageData = await page.evaluate(() => {
      // 尝试多种方式获取 score ID
      let scoreId = null;
      let title = document.title;

      // 从 URL 提取
      const urlMatch = window.location.href.match(/scores\/(\d+)/);
      if (urlMatch) scoreId = parseInt(urlMatch[1]);

      // 从页面 meta/script 提取
      if (!scoreId) {
        const scripts = document.querySelectorAll('script');
        for (const s of scripts) {
          const text = s.textContent || '';
          const idMatch = text.match(/"id"\s*:\s*(\d+)/);
          if (idMatch) { scoreId = parseInt(idMatch[1]); break; }
        }
      }

      // 从 canonical 提取
      if (!scoreId) {
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
          const m = canonical.getAttribute('href')?.match(/scores\/(\d+)/);
          if (m) scoreId = parseInt(m[1]);
        }
      }

      return { scoreId, title };
    });

    console.log('[MuseScore] Score ID:', pageData.scoreId, 'Title:', pageData.title);

    if (!pageData.scoreId) {
      throw new Error('无法从页面提取曲谱 ID');
    }

    // 提取 suffix（从页面已加载的 JS 中）
    const suffix = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[src]');
      for (const s of scripts) {
        const src = s.getAttribute('src') || '';
        if (src.includes('musescore') && src.includes('/20')) {
          return src;
        }
      }

      // 从 link preload 中找
      const links = document.querySelectorAll('link[href]');
      for (const l of links) {
        const href = l.getAttribute('href') || '';
        if (href.includes('musescore') && href.includes('/20') && href.endsWith('.js')) {
          return href;
        }
      }
      return null;
    });

    console.log('[MuseScore] JS bundle URL:', suffix?.substring(0, 80));

    const scoreId = pageData.scoreId;
    const apiUrl = `https://musescore.com/api/jmuse?id=${scoreId}&type=midi&index=0`;

    let midiDownloadUrl = null;

    // 提取 suffix：从页面 JS bundle 中找签名后缀
    let extractedSuffix = null;
    try {
      extractedSuffix = await page.evaluate(async () => {
        const links = [
          ...document.querySelectorAll('link[href*="musescore"][href$=".js"]'),
          ...document.querySelectorAll('script[src*="musescore"]'),
        ];
        for (const el of links) {
          const href = el.getAttribute('href') || el.getAttribute('src');
          if (!href) continue;
          try {
            const resp = await fetch(href);
            const text = await resp.text();
            const match = text.match(/"([^"]+)"\)\.substr\(0,4\)/);
            if (match) return match[1];
          } catch {}
        }
        return null;
      });
    } catch {}

    console.log('[MuseScore] 提取到的 suffix:', extractedSuffix);

    // 构建多个 auth 候选
    const suffixes = [extractedSuffix, '9654,4e'].filter(Boolean);
    const authTokens = suffixes.map(s => md5(`${scoreId}midi0${s}`).slice(0, 4));
    if (capturedMp3Auth) authTokens.unshift(capturedMp3Auth);

    console.log('[MuseScore] 尝试 auth tokens:', authTokens);

    // 在浏览器中逐个尝试
    for (const auth of authTokens) {
      if (capturedMidiUrl) break;
      try {
        const result = await page.evaluate(async (params) => {
          try {
            const r = await fetch(params.apiUrl, { headers: { Authorization: params.auth } });
            if (r.ok) {
              const json = await r.json();
              return json?.info?.url || null;
            }
          } catch {}
          return null;
        }, { apiUrl, auth });
        if (result) {
          capturedMidiUrl = result;
          console.log('[MuseScore] 直接获取成功, auth:', auth);
        }
      } catch {}
    }

    // 最后尝试不带 auth
    if (!capturedMidiUrl) {
      try {
        const result = await page.evaluate(async (url) => {
          try {
            const r = await fetch(url);
            if (r.ok) { const j = await r.json(); return j?.info?.url || null; }
          } catch {}
          return null;
        }, apiUrl);
        if (result) capturedMidiUrl = result;
      } catch {}
    }

    midiDownloadUrl = capturedMidiUrl;

    if (!midiDownloadUrl) {
      throw new Error('无法获取 MIDI 下载链接');
    }

    console.log('[MuseScore] MIDI URL:', midiDownloadUrl.substring(0, 80));

    // 下载 MIDI 文件
    const midiResponse = await axios.get(midiDownloadUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const safeName = (pageData.title || `score-${scoreId}`)
      .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 60);
    const filename = `${safeName}-${scoreId}.mid`;
    const filepath = path.join(DOWNLOAD_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(midiResponse.data));

    console.log('[MuseScore] 保存成功:', filename, `(${midiResponse.data.byteLength} bytes)`);

    return { filename, filepath, relativePath: `uploads/midi/${filename}` };

  } finally {
    await browser.close();
  }
}

/**
 * 解析 MIDI 文件
 */
function parseMidiFile(filepath) {
  const { Midi } = require('@tonejs/midi');
  const midiData = fs.readFileSync(filepath);
  const midi = new Midi(midiData);

  // 优先选第一条有音符的轨道——通常是主旋律（避开伴奏轨）
  let mainTrack = midi.tracks.find(t => t.notes.length > 0) || midi.tracks[0];
  // 若曲谱有大提琴轨（midi program 42=Cello, 40=Violin, 41=Viola），优先选大提琴
  const celloTrack = midi.tracks.find(t =>
    t.notes.length > 0 && (t.instrument?.number === 42 || /cello|violoncello/i.test(t.name || ''))
  );
  if (celloTrack) mainTrack = celloTrack;

  const notes = [];
  for (const note of mainTrack.notes) {
    notes.push({
      name: note.name.replace(/[0-9]/g, ''),
      octave: note.octave,
      midi: note.midi,
      time: note.time,
      duration: note.duration,
      ticks: note.ticks,
      durationTicks: note.durationTicks,
      velocity: note.velocity
    });
  }
  notes.sort((a, b) => a.time - b.time);

  // 拍号：默认 4/4
  const ts = midi.header.timeSignatures?.[0]?.timeSignature || [4, 4];
  // 调号：默认 C 大调
  const ks = midi.header.keySignatures?.[0];

  return {
    name: midi.name || path.basename(filepath, path.extname(filepath)),
    bpm: midi.header.tempos?.[0]?.bpm || 120,
    duration: midi.duration,
    trackCount: midi.tracks.length,
    trackName: mainTrack.name || '',
    noteCount: notes.length,
    timeSignature: ts,
    keySignature: ks?.key || 'C',
    keyScale: ks?.scale || 'major',
    ppq: midi.header.ppq || 480,
    notes
  };
}

// 用户上传目录（曲谱页上传的 MIDI 也存在此处）
const SHEETS_DIR = path.join(__dirname, '../../uploads/sheets');

// 给定文件名，从两个 MIDI 目录中找到完整路径
function resolveMidiPath(filename) {
  const a = path.join(DOWNLOAD_DIR, filename);
  if (fs.existsSync(a)) return a;
  const b = path.join(SHEETS_DIR, filename);
  if (fs.existsSync(b)) return b;
  return null;
}

function listMidiFiles() {
  const result = [];
  const dirs = [DOWNLOAD_DIR, SHEETS_DIR];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(mid|midi)$/i.test(f)) continue;
      const filepath = path.join(dir, f);
      const stat = fs.statSync(filepath);
      result.push({
        filename: f,
        name: f.replace(/\.(mid|midi)$/i, ''),
        size: stat.size,
        created: stat.mtime,
      });
    }
  }

  return result.sort((a, b) => new Date(b.created) - new Date(a.created));
}

module.exports = { downloadMidi, parseMidiFile, listMidiFiles, resolveMidiPath, DOWNLOAD_DIR, SHEETS_DIR };
