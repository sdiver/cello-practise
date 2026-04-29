/**
 * MIDI 音符序列 → VexFlow 五线谱数据结构
 *
 * 输入：parseMidiFile 返回的 notes 数组（含 ticks、durationTicks）
 * 输出：分小节的 StaveNote 描述（{keys, duration, accidentals, originalIndex}）
 */

export interface MidiNote {
  name: string // C / D / E ... (无升降，无八度数字)
  octave: number
  midi: number // 21..108
  time: number // seconds
  duration: number // seconds
  ticks: number
  durationTicks: number
  velocity: number
}

export interface StaffNoteSpec {
  keys: string[] // VexFlow 音名格式 'c/4'，含升降的写法 'c#/4' / 'bb/4'
  duration: string // 'w' | 'h' | 'q' | '8' | '16' | 'qr'(休止符) ...
  isRest: boolean
  accidentals: (string | null)[] // ['#', null, 'b']
  originalIndex: number // 在原始 notes 数组中的索引（rest=-1）
}

export interface StaffMeasure {
  notes: StaffNoteSpec[]
  beats: number // 该小节累计 beats（应等于 timeSig 的分子）
}

/** MIDI 音名 → VexFlow key 与 accidental */
function midiToKey(midi: number): { key: string; accidental: string | null } {
  const noteNames = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
  const naturalMap: Record<string, string> = {
    'c#': 'c', 'd#': 'd', 'f#': 'f', 'g#': 'g', 'a#': 'a',
  }
  const accidentalMap: Record<string, string> = {
    'c#': '#', 'd#': '#', 'f#': '#', 'g#': '#', 'a#': '#',
  }
  const idx = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const raw = noteNames[idx]
  const natural = naturalMap[raw] || raw
  const accidental = accidentalMap[raw] || null
  return { key: `${natural}/${octave}`, accidental }
}

/** ticks 时值 → VexFlow duration code（含附点） */
function ticksToDuration(ticks: number, ppq: number): { duration: string; dots: number } {
  // 1 quarter = ppq ticks; 1 whole = 4*ppq
  const ratio = ticks / ppq
  // 标准时值表（含附点）
  const table: { ratio: number; duration: string; dots: number }[] = [
    { ratio: 6, duration: 'w', dots: 1 }, // 附点全音符（极少见，6 拍）
    { ratio: 4, duration: 'w', dots: 0 }, // 全音符
    { ratio: 3, duration: 'h', dots: 1 }, // 附点二分
    { ratio: 2, duration: 'h', dots: 0 }, // 二分
    { ratio: 1.5, duration: 'q', dots: 1 }, // 附点四分
    { ratio: 1, duration: 'q', dots: 0 }, // 四分
    { ratio: 0.75, duration: '8', dots: 1 }, // 附点八分
    { ratio: 0.5, duration: '8', dots: 0 }, // 八分
    { ratio: 0.375, duration: '16', dots: 1 }, // 附点十六
    { ratio: 0.25, duration: '16', dots: 0 }, // 十六分
    { ratio: 0.125, duration: '32', dots: 0 }, // 三十二分
  ]
  // 找最接近的（不超过的最大值）
  for (const t of table) {
    if (ratio >= t.ratio - 0.01) return { duration: t.duration, dots: t.dots }
  }
  return { duration: '32', dots: 0 }
}

/**
 * 将 MIDI 音符按拍号切成小节
 *
 * @param notes 音符数组（按 ticks 升序）
 * @param ppq 每四分音符的 ticks
 * @param timeSig [分子, 分母]
 */
export function splitToMeasures(
  notes: MidiNote[],
  ppq: number,
  timeSig: [number, number]
): StaffMeasure[] {
  const [beats, beatType] = timeSig
  // 一小节多少 ticks = ppq * beats * (4 / beatType)
  const ticksPerMeasure = ppq * beats * (4 / beatType)

  if (notes.length === 0) return []

  // 把所有音符（含间隙作为休止符）合到时间轴
  const measures: StaffMeasure[] = []
  let measureIdx = 0
  let cursorTicks = 0
  let currentMeasure: StaffNoteSpec[] = []
  const startMeasureTicks = () => measureIdx * ticksPerMeasure
  const endMeasureTicks = () => (measureIdx + 1) * ticksPerMeasure

  const pushMeasure = () => {
    measures.push({ notes: currentMeasure, beats })
    currentMeasure = []
    measureIdx++
    cursorTicks = startMeasureTicks()
  }

  // 音符前置休止
  const fillRestUntil = (untilTicks: number) => {
    while (cursorTicks < untilTicks) {
      const remainInMeasure = endMeasureTicks() - cursorTicks
      const restTicks = Math.min(untilTicks - cursorTicks, remainInMeasure)
      if (restTicks <= 0) break
      const { duration } = ticksToDuration(restTicks, ppq)
      currentMeasure.push({
        keys: ['b/4'], // 休止符占位
        duration: duration + 'r',
        isRest: true,
        accidentals: [null],
        originalIndex: -1,
      })
      cursorTicks += restTicks
      if (cursorTicks >= endMeasureTicks() - 0.5) {
        pushMeasure()
      }
    }
  }

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]
    // 跨小节边界：切到当前小节末尾
    fillRestUntil(note.ticks)

    // 关键修复：使用 attack-to-attack 间隔作为有效时值
    // MIDI 音符 durationTicks 是物理演奏长度（含 release），常小于真正的拍子时值，
    // 直接用会在每个音符之后留出短休止"杂草"。改用到下一个音符 attack 的距离。
    const nextTicks = notes[i + 1]?.ticks ?? (note.ticks + note.durationTicks)
    let remainingTicks = Math.max(1, nextTicks - note.ticks)
    while (remainingTicks > 0) {
      const remainInMeasure = endMeasureTicks() - cursorTicks
      const useTicks = Math.min(remainingTicks, remainInMeasure)
      const { duration, dots } = ticksToDuration(useTicks, ppq)
      const { key, accidental } = midiToKey(note.midi)

      let durationStr = duration
      for (let d = 0; d < dots; d++) durationStr += 'd'

      currentMeasure.push({
        keys: [key],
        duration: durationStr,
        isRest: false,
        accidentals: [accidental],
        originalIndex: i,
      })

      cursorTicks += useTicks
      remainingTicks -= useTicks

      if (cursorTicks >= endMeasureTicks() - 0.5) {
        pushMeasure()
      }
    }
  }

  // 收尾：最后小节如不满，补休止
  if (currentMeasure.length > 0) {
    fillRestUntil(endMeasureTicks())
    if (currentMeasure.length > 0) {
      measures.push({ notes: currentMeasure, beats })
    }
  }

  return measures
}

/** 调号 fifths 映射（+1 = G, -1 = F 等） */
export function keyToVexKey(key: string, scale: string): string {
  if (!key) return 'C'

  // 兼容 "D major" / "G minor" 这种带 scale 的复合字符串
  const trimmed = key.trim()
  let normalizedKey = trimmed
  let normalizedScale = scale || 'major'
  const lower = trimmed.toLowerCase()
  if (lower.endsWith(' major') || lower.endsWith(' maj')) {
    normalizedKey = trimmed.split(/\s+/)[0]
    normalizedScale = 'major'
  } else if (lower.endsWith(' minor') || lower.endsWith(' min')) {
    normalizedKey = trimmed.split(/\s+/)[0]
    normalizedScale = 'minor'
  }

  if (normalizedScale === 'minor') {
    // minor → 转关系大调（VexFlow 不直接支持小调标记，按关系大调画调号）
    const minorToMajor: Record<string, string> = {
      'A': 'C', 'E': 'G', 'B': 'D', 'F#': 'A', 'C#': 'E', 'G#': 'B',
      'D': 'F', 'G': 'Bb', 'C': 'Eb', 'F': 'Ab', 'Bb': 'Db', 'Eb': 'Gb',
    }
    return minorToMajor[normalizedKey] || normalizedKey
  }

  // VexFlow 标准调号集合（白名单）
  const validKeys = new Set([
    'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
    'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  ])
  return validKeys.has(normalizedKey) ? normalizedKey : 'C'
}
