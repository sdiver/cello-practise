const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

/**
 * 解析 MusicXML 文件
 * @param {string} filePath - 文件路径
 * @returns {Object} 解析后的琴谱信息
 */
function parseMusicXML(filePath) {
  let xmlContent;
  const ext = path.extname(filePath).toLowerCase();

  try {
    // 如果是 .mxl 文件，先解压
    if (ext === '.mxl') {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();

      // 查找 XML 文件（优先查找 score.xml 或 mxl 根目录下的 xml 文件）
      let xmlEntry = entries.find(e =>
        e.entryName === 'score.xml' ||
        e.entryName.endsWith('/score.xml')
      );

      // 如果没找到 score.xml，找第一个有效的 XML 文件（排除 META-INF/container.xml）
      if (!xmlEntry) {
        xmlEntry = entries.find(e => {
          const name = e.entryName;
          // 必须是 .xml 文件
          if (!name.endsWith('.xml')) return false;
          // 排除隐藏文件和系统文件
          if (name.startsWith('_')) return false;
          if (name.includes('__MACOSX')) return false;
          if (name.startsWith('.')) return false;
          // 排除 META-INF 目录下的文件（如 container.xml）
          if (name.startsWith('META-INF/')) return false;
          return true;
        });
      }

      if (!xmlEntry) {
        // 列出所有文件帮助调试
        console.log('MXL 文件内容:', entries.map(e => e.entryName));
        throw new Error('无法在 .mxl 文件中找到 XML 内容');
      }

      console.log('找到 XML 文件:', xmlEntry.entryName);
      xmlContent = zip.readAsText(xmlEntry);
    } else {
      // 直接读取 .xml 文件
      xmlContent = fs.readFileSync(filePath, 'utf-8');
    }

    // 检查是否是有效的 MusicXML（包含 score-partwise 或 score-timewise）
    if (!xmlContent.includes('score-partwise') && !xmlContent.includes('score-timewise')) {
      console.log('XML 内容前500字符:', xmlContent.substring(0, 500));
      throw new Error('不是有效的 MusicXML 文件（缺少 score-partwise 或 score-timewise 标签）');
    }

    // 解析 XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseAttributeValue: true,
      trimValues: true,
      parseTagValue: false
    });

    const result = parser.parse(xmlContent);

    // 提取信息
    return extractScoreInfo(result, filePath);

  } catch (err) {
    console.error('解析 MusicXML 失败:', err);
    throw new Error(`解析失败: ${err.message}`);
  }
}

/**
 * 从解析后的 XML 提取琴谱信息
 */
function extractScoreInfo(xmlObj, filePath) {
  // 调试：打印所有顶层键
  console.log('XML 顶层键:', Object.keys(xmlObj));

  // 尝试找到 score 对象 - 可能在不同的键名下
  let score = xmlObj['score-partwise'] || xmlObj['score-timewise'];

  // 如果没找到，可能是嵌套在 ?xml 或其他包装器中
  if (!score) {
    // 遍历所有顶层键查找 score-partwise 或 score-timewise
    for (const key of Object.keys(xmlObj)) {
      if (key === 'score-partwise' || key === 'score-timewise') {
        score = xmlObj[key];
        break;
      }
      // 检查嵌套结构
      if (xmlObj[key] && typeof xmlObj[key] === 'object') {
        if (xmlObj[key]['score-partwise']) {
          score = xmlObj[key]['score-partwise'];
          break;
        }
        if (xmlObj[key]['score-timewise']) {
          score = xmlObj[key]['score-timewise'];
          break;
        }
      }
    }
  }

  if (!score) {
    console.log('XML 对象结构:', JSON.stringify(xmlObj, null, 2).substring(0, 2000));
    throw new Error('不支持的 MusicXML 格式');
  }

  console.log('找到 score 对象，键:', Object.keys(score).slice(0, 10));

  // 提取标题 - 多种可能的位置
  let title = null;

  // 1. work-title
  if (score.work?.['work-title']) {
    title = score.work['work-title'];
  }
  // 2. movement-title
  else if (score.movement?.['movement-title']) {
    title = score.movement['movement-title'];
  }
  // 3. credit 中的 title
  else if (score.credit) {
    const credits = Array.isArray(score.credit) ? score.credit : [score.credit];
    const titleCredit = credits.find(c => c['credit-type'] === 'title' || c['@_page'] === '1');
    if (titleCredit?.['credit-words']) {
      title = titleCredit['credit-words'];
    } else if (titleCredit?.['credit-type']) {
      // 尝试其他字段
      const words = Object.values(titleCredit).find(v => typeof v === 'string' && v.length > 0);
      if (words) title = words;
    }
  }

  if (!title) {
    title = path.basename(filePath, path.extname(filePath));
  }

  // 提取作曲家
  let composer = 'Unknown Composer';
  const identification = score.identification;

  if (identification) {
    // creator 字段
    if (identification.creator) {
      const creators = Array.isArray(identification.creator)
        ? identification.creator
        : [identification.creator];

      const composerEntry = creators.find(c =>
        c['@_type'] === 'composer' ||
        (typeof c === 'string' && c.toLowerCase().includes('composer'))
      );

      if (composerEntry) {
        if (typeof composerEntry === 'string') {
          composer = composerEntry;
        } else {
          composer = composerEntry['#text'] || composerEntry['text'] || 'Unknown Composer';
        }
      }
    }

    // 在 rights 中查找
    if (composer === 'Unknown Composer' && identification.rights) {
      const rights = Array.isArray(identification.rights)
        ? identification.rights
        : [identification.rights];
      const composerRight = rights.find(r =>
        typeof r === 'string' && (r.toLowerCase().includes('composer') || r.toLowerCase().includes('by '))
      );
      if (composerRight) {
        composer = composerRight.replace(/^.*?by\s+/i, '').trim();
      }
    }
  }

  // 提取部分信息（乐器）
  const partList = score['part-list'];
  let instruments = [];

  if (partList?.['score-part']) {
    const parts = Array.isArray(partList['score-part'])
      ? partList['score-part']
      : [partList['score-part']];

    instruments = parts.map(p => ({
      id: p['@_id'] || p.id,
      name: p['part-name'] || p['partName'] || 'Unknown',
      abbreviation: p['part-abbreviation'] || p['partAbbreviation']
    })).filter(p => p.name);
  }

  // 计算小节数
  let measureCount = 0;
  const parts = score.part;

  if (parts) {
    const partArray = Array.isArray(parts) ? parts : [parts];
    if (partArray.length > 0) {
      const firstPart = partArray[0];
      if (firstPart.measure) {
        measureCount = Array.isArray(firstPart.measure)
          ? firstPart.measure.length
          : 1;
      }
    }
  }

  // 提取拍号、调号等 - 从第一个小节的 attributes
  let timeSignature = null;
  let keySignature = null;

  // 尝试多种路径找到 attributes
  let attributes = null;
  const parts2 = score.part;

  if (parts2) {
    const partArray = Array.isArray(parts2) ? parts2 : [parts2];
    if (partArray.length > 0) {
      const firstPart = partArray[0];
      const measures = firstPart.measure
        ? (Array.isArray(firstPart.measure) ? firstPart.measure : [firstPart.measure])
        : [];

      if (measures.length > 0) {
        // 查找有 attributes 的第一个 measure
        for (const measure of measures) {
          if (measure.attributes) {
            attributes = measure.attributes;
            break;
          }
        }
      }
    }
  }

  if (attributes) {
    // 拍号
    if (attributes.time) {
      const time = attributes.time;
      const beats = Array.isArray(time.beats) ? time.beats[0] : time.beats;
      const beatType = Array.isArray(time['beat-type']) ? time['beat-type'][0] : time['beat-type'];
      if (beats && beatType) {
        timeSignature = `${beats}/${beatType}`;
      }
    }

    // 调号
    if (attributes.key?.fifths !== undefined) {
      keySignature = parseInt(attributes.key.fifths);
    }
  }

  return {
    title: cleanText(title),
    composer: cleanText(composer),
    instruments: instruments.slice(0, 5),
    measure_count: measureCount,
    time_signature: timeSignature,
    key_signature: keySignature,
    file_type: path.extname(filePath).toLowerCase(),
    parsed_at: new Date().toISOString()
  };
}

/**
 * 清理文本
 */
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\n\r\t]/g, '')
    .trim();
}

/**
 * 检测是否为有效的 MusicXML 文件
 */
function isValidMusicXML(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.xml', '.mxl', '.musicxml'].includes(ext);
}

/**
 * 推断难度等级
 */
function inferDifficulty(measureCount, instruments) {
  // 简单启发式规则
  if (measureCount < 20) return 'beginner';
  if (measureCount > 100) return 'advanced';
  return 'intermediate';
}

module.exports = {
  parseMusicXML,
  isValidMusicXML,
  inferDifficulty
};
