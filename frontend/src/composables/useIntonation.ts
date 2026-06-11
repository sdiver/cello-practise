// 录音音准分析引擎：解码音频 → YIN 逐帧测音高 → 切分音符 → 与十二平均律对比
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(midi: number): string {
  const n = Math.round(midi)
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

export interface NoteSegment {
  t0: number
  t1: number
  dur: number
  midi: number      // 实际音高中位数
  target: number    // 最近的标准音（MIDI 号）
  cents: number     // 与标准音的偏差（音分，绝对值含调弦偏移）
  spread: number    // 音内波动（音分，越小越稳）
}

export interface OpenStringInfo {
  name: string
  median: number
  count: number
}

export interface NoteIssue {
  name: string
  medianRel: number
  count: number
}

export interface IntonationResult {
  duration: number
  trackT: number[]
  trackMidi: (number | null)[]
  segments: NoteSegment[]
  globalOffset: number              // 整体调音偏移（音分）
  counts: { good: number; fair: number; poor: number }
  openStrings: OpenStringInfo[]
  noteIssues: NoteIssue[]
  avgSpread: number
  advice: string[]
}

const SR = 12000          // 分析采样率：降采样减少计算量，对 50–520Hz 足够
const WIN = 768           // YIN 积分窗
const MAX_TAU = 300       // 最低 40Hz（大提琴 C2=65Hz 留余量）
const MIN_TAU = 22        // 最高约 545Hz
const FRAME = WIN + MAX_TAU
const HOP = 128           // 约 10.7ms 一帧
const YIN_THRESHOLD = 0.12
const MIDI_LO = 33        // A1：低于此视为误检
const MIDI_HI = 72        // C5：儿童曲目不会更高

// 大提琴四根空弦
const OPEN_STRINGS: Record<number, string> = { 36: 'C弦', 43: 'G弦', 50: 'D弦', 57: 'A弦' }

async function decodeToMono12k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer()
  const ctx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(arrayBuf)
  } finally {
    ctx.close()
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SR), SR)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}

/** 单帧 YIN：返回频率（Hz），检测不到返回 -1 */
function yinFrame(x: Float32Array, offset: number): number {
  const d = new Float32Array(MAX_TAU + 1)
  for (let tau = 1; tau <= MAX_TAU; tau++) {
    let sum = 0
    for (let j = 0; j < WIN; j++) {
      const diff = x[offset + j] - x[offset + j + tau]
      sum += diff * diff
    }
    d[tau] = sum
  }
  // 累积均值归一化
  let running = 0
  const cmnd = new Float32Array(MAX_TAU + 1)
  cmnd[0] = 1
  for (let tau = 1; tau <= MAX_TAU; tau++) {
    running += d[tau]
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1
  }
  for (let tau = MIN_TAU; tau < MAX_TAU; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      // 找局部最小后抛物线插值
      while (tau + 1 < MAX_TAU && cmnd[tau + 1] < cmnd[tau]) tau++
      const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1]
      const denom = a - 2 * b + c
      const p = denom !== 0 ? 0.5 * (a - c) / denom : 0
      return SR / (tau + p)
    }
  }
  return -1
}

function median(arr: number[]): number {
  if (!arr.length) return NaN
  const s = [...arr].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx]
}

export async function analyzeAudio(
  blob: Blob,
  onProgress?: (percent: number) => void
): Promise<IntonationResult> {
  const pcm = await decodeToMono12k(blob)
  const duration = pcm.length / SR
  const nFrames = Math.max(0, Math.floor((pcm.length - FRAME) / HOP))
  if (nFrames < 10) throw new Error('录音太短，无法分析')

  // 帧 RMS，用于自适应静音门限（不同录音响度差异很大）
  const rms = new Float32Array(nFrames)
  for (let i = 0; i < nFrames; i++) {
    let sum = 0
    const off = i * HOP
    for (let j = 0; j < FRAME; j += 4) sum += pcm[off + j] * pcm[off + j]
    rms[i] = Math.sqrt(sum / (FRAME / 4))
  }
  const sortedRms = [...rms].sort((a, b) => a - b)
  const gate = Math.max(1e-3, 0.05 * percentile(sortedRms, 95))

  // 逐帧测音高（分批让出主线程，避免页面卡死）
  const rawMidi: (number | null)[] = new Array(nFrames).fill(null)
  for (let i = 0; i < nFrames; i++) {
    if (rms[i] >= gate) {
      const freq = yinFrame(pcm, i * HOP)
      if (freq > 0) rawMidi[i] = 69 + 12 * Math.log2(freq / 440)
    }
    if (i % 200 === 199) {
      onProgress?.(Math.round((i / nFrames) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }
  onProgress?.(100)

  // 中值滤波去除八度误检毛刺
  const K = 7, half = K >> 1
  const smooth: (number | null)[] = new Array(nFrames).fill(null)
  for (let i = 0; i < nFrames; i++) {
    const w: number[] = []
    for (let j = Math.max(0, i - half); j <= Math.min(nFrames - 1, i + half); j++) {
      const v = rawMidi[j]
      if (v !== null) w.push(v)
    }
    if (w.length) smooth[i] = median(w)
  }

  const frameSec = HOP / SR
  const trackT: number[] = []
  const trackMidi: (number | null)[] = []
  for (let i = 0; i < nFrames; i++) {
    trackT.push(i * frameSec)
    trackMidi.push(smooth[i])
  }

  // 切分音符：连续帧落在同一个最近半音 ±0.75 内
  const segments: NoteSegment[] = []
  let i = 0
  while (i < nFrames) {
    const v0 = smooth[i]
    if (v0 === null) { i++; continue }
    const target = Math.round(v0)
    let j = i, gap = 0
    while (j < nFrames) {
      const v = smooth[j]
      if (v === null || Math.abs(v - target) > 0.75) {
        gap++
        if (gap > 6) break
      } else {
        gap = 0
      }
      j++
    }
    const vals: number[] = []
    for (let k = i; k < j; k++) {
      const v = smooth[k]
      if (v !== null && Math.abs(v - target) <= 0.75) vals.push(v)
    }
    const dur = (j - i) * frameSec
    if (dur >= 0.22 && vals.length >= 18 && target >= MIDI_LO && target <= MIDI_HI) {
      // 取中段 70% 避开起弓/收弓滑音
      const k0 = Math.floor(vals.length * 0.15)
      const k1 = Math.max(k0 + 1, Math.floor(vals.length * 0.85))
      const core = vals.slice(k0, k1).sort((a, b) => a - b)
      const med = median(core)
      segments.push({
        t0: i * frameSec,
        t1: Math.min(j, nFrames - 1) * frameSec,
        dur,
        midi: med,
        target: Math.round(med),
        cents: (med - Math.round(med)) * 100,
        spread: (percentile(core, 84) - percentile(core, 16)) * 100,
      })
    }
    i = Math.max(j, i + 1)
  }

  if (!segments.length) {
    throw new Error('没有检测到稳定的音符——请确认录音里有清晰的拉奏声')
  }

  // 整体调音偏移（按时值加权）
  let wSum = 0, cSum = 0, sSum = 0
  for (const s of segments) { wSum += s.dur; cSum += s.cents * s.dur; sSum += s.spread * s.dur }
  const globalOffset = cSum / wSum
  const avgSpread = sSum / wSum

  const counts = { good: 0, fair: 0, poor: 0 }
  for (const s of segments) {
    const rel = Math.abs(s.cents - globalOffset)
    if (rel <= 15) counts.good++
    else if (rel <= 30) counts.fair++
    else counts.poor++
  }

  // 空弦检查（注意：低把位这些音通常是空弦，但也可能是按出来的）
  const openStrings: OpenStringInfo[] = []
  for (const [midiStr, name] of Object.entries(OPEN_STRINGS)) {
    const m = Number(midiStr)
    const vals = segments.filter(s => s.target === m).map(s => s.cents)
    if (vals.length) openStrings.push({ name, median: median(vals), count: vals.length })
  }

  // 系统性按指偏差：同一个音反复偏向同一边
  const byNote = new Map<number, number[]>()
  for (const s of segments) {
    const rel = s.cents - globalOffset
    if (!byNote.has(s.target)) byNote.set(s.target, [])
    byNote.get(s.target)!.push(rel)
  }
  const noteIssues: NoteIssue[] = []
  for (const [target, rels] of byNote) {
    if (rels.length >= 2) {
      const m = median(rels)
      if (Math.abs(m) > 20) noteIssues.push({ name: noteName(target), medianRel: m, count: rels.length })
    }
  }
  noteIssues.sort((a, b) => Math.abs(b.medianRel) - Math.abs(a.medianRel))

  // 自动生成建议
  const advice: string[] = []
  const badStrings = openStrings.filter(o => Math.abs(o.median) >= 20)
  if (badStrings.length) {
    const desc = badStrings
      .map(o => `${o.name}偏${o.median > 0 ? '高' : '低'}约${Math.round(Math.abs(o.median))}音分`)
      .join('、')
    advice.push(`🔧 先调琴：${desc}。弦不准时手指按得再对也不好听，建议每次练琴前用调音器把四根弦调好。`)
  }
  const total = segments.length
  const goodPct = Math.round((counts.good / total) * 100)
  if (counts.poor / total > 0.25) {
    advice.push(`🎯 按指音准还有较大提升空间（${goodPct}% 的音在 ±15 音分内）。建议放慢速度，每个音拉长一点，听准了再换下一个音。`)
  } else if (counts.poor > 0) {
    advice.push(`👍 大部分音是准的（${goodPct}% 在 ±15 音分内），重点改进下面列出的几个常偏的音。`)
  } else {
    advice.push(`🌟 音准很棒！${goodPct}% 的音在 ±15 音分内，继续保持。`)
  }
  for (const issue of noteIssues.slice(0, 3)) {
    advice.push(
      `📍 ${issue.name} 出现 ${issue.count} 次，普遍偏${issue.medianRel > 0 ? '高' : '低'}约 ${Math.round(Math.abs(issue.medianRel))} 音分——按这个音时手指位置${issue.medianRel > 0 ? '靠桥了一点，往琴头方向挪一挪' : '靠琴头了一点，往琴桥方向挪一挪'}。`
    )
  }
  if (avgSpread > 25) {
    advice.push(`🎻 长音里音高有明显晃动（平均波动 ${Math.round(avgSpread)} 音分）：手指按实、弓速弓压保持均匀会更稳。每天几分钟慢弓空弦练习很有帮助。`)
  }

  return {
    duration, trackT, trackMidi, segments, globalOffset,
    counts, openStrings, noteIssues, avgSpread, advice,
  }
}
