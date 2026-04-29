/**
 * MIDI 文件工具——
 * 历史上此模块还含 MuseScore 网络下载（playwright + Cloudflare 绕过），
 * 因功能撤除已移除该部分；仅保留本地 MIDI 解析与列举工具。
 */
const path = require('path');
const fs = require('fs');

const DOWNLOAD_DIR = path.join(__dirname, '../../uploads/midi');
const SHEETS_DIR = path.join(__dirname, '../../uploads/sheets');

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
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

/** 给定文件名，从两个 MIDI 目录中找到完整路径 */
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

module.exports = { parseMidiFile, listMidiFiles, resolveMidiPath, DOWNLOAD_DIR, SHEETS_DIR };
