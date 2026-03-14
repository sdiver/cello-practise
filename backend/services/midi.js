const fs = require('fs');
const path = require('path');
const Midi = require('@tonejs/midi').Midi;

/**
 * 解析 MIDI 文件
 * @param {string} filePath - 文件路径
 * @returns {Object} 解析后的琴谱信息
 */
function parseMidi(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    const midi = new Midi(buffer);

    console.log('MIDI 文件解析成功:', midi.name || path.basename(filePath));
    console.log('轨道数:', midi.tracks.length);

    // 提取所有音符
    let allNotes = [];
    let totalDuration = 0;

    midi.tracks.forEach((track, index) => {
      console.log(`轨道 ${index}: ${track.notes.length} 个音符, 乐器: ${track.instrument?.name || 'unknown'}`);

      if (track.notes.length > 0) {
        track.notes.forEach(note => {
          allNotes.push({
            name: note.name,
            midi: note.midi,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
            track: index
          });

          const noteEnd = note.time + note.duration;
          if (noteEnd > totalDuration) {
            totalDuration = noteEnd;
          }
        });
      }
    });

    // 按时间排序
    allNotes.sort((a, b) => a.time - b.time);

    // 计算 BPM
    const bpm = midi.header.tempos?.[0]?.bpm || 120;

    // 计算拍号
    let timeSignature = { numerator: 4, denominator: 4 };
    if (midi.header.timeSignatures && midi.header.timeSignatures.length > 0) {
      const ts = midi.header.timeSignatures[0];
      timeSignature = {
        numerator: ts.numerator || ts.timeSignature?.[0] || 4,
        denominator: ts.denominator || ts.timeSignature?.[1] || 4
      };
    }

    // 计算小节数
    const secondsPerBar = (60 / bpm) * timeSignature.numerator * (4 / timeSignature.denominator);
    const measureCount = Math.ceil(totalDuration / secondsPerBar);

    // 提取乐器信息
    const instruments = midi.tracks
      .filter(t => t.instrument && t.instrument.name)
      .map((t, i) => ({
        id: i,
        name: t.instrument.name,
        family: t.instrument.family,
        number: t.instrument.number
      }));

    // 提取调号（如果有）
    const keySignature = midi.header.keySignatures?.[0];

    return {
      title: midi.name || path.basename(filePath, path.extname(filePath)),
      composer: midi.author || 'Unknown Composer',
      duration: totalDuration,
      bpm: bpm,
      time_signature: `${timeSignature.numerator}/${timeSignature.denominator}`,
      key_signature: keySignature ? keySignature.key : null,
      measure_count: measureCount || Math.ceil(allNotes.length / 4),
      instruments: instruments.slice(0, 5),
      note_count: allNotes.length,
      notes: allNotes.slice(0, 100), // 只返回前100个音符用于预览
      tracks: midi.tracks.length,
      file_type: '.mid',
      parsed_at: new Date().toISOString()
    };

  } catch (err) {
    console.error('解析 MIDI 失败:', err);
    throw new Error(`解析失败: ${err.message}`);
  }
}

/**
 * 将 MIDI 音符转换为频率
 */
function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 检测是否为有效的 MIDI 文件
 */
function isValidMidi(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.mid', '.midi', '.smf'].includes(ext);
}

/**
 * 推断难度等级
 */
function inferDifficulty(noteCount, duration) {
  // 简单启发式规则
  if (noteCount < 50 || duration < 30) return 'beginner';
  if (noteCount > 500 || duration > 300) return 'advanced';
  return 'intermediate';
}

module.exports = {
  parseMidi,
  midiToFrequency,
  isValidMidi,
  inferDifficulty
};
