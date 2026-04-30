import { ref, computed, onUnmounted } from 'vue'

export interface NoteItem {
  note: string        // 音名 如 C4, D4, A3
  noteName: string    // 纯音名 如 C, D, A
  octave: number
  frequency: number   // 标准频率
  duration?: number   // 时值（拍数），仅展示用
  status: 'pending' | 'active' | 'correct' | 'wrong'
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// 音名转频率
function noteToFreq(name: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name)
  if (idx === -1) return 0
  const midiNote = (octave + 1) * 12 + idx
  return 440 * Math.pow(2, (midiNote - 69) / 12)
}

// 频率转音名
function freqToNote(freq: number): { name: string; octave: number } | null {
  if (freq <= 0) return null
  const midiNote = 12 * Math.log2(freq / 440) + 69
  const rounded = Math.round(midiNote)
  const octave = Math.floor(rounded / 12) - 1
  const noteIdx = rounded % 12
  return { name: NOTE_NAMES[noteIdx], octave }
}

// 判断两个音是否匹配（允许1个半音的误差）
function isNoteMatch(detectedFreq: number, targetNote: string, targetOctave: number): boolean {
  const detected = freqToNote(detectedFreq)
  if (!detected) return false
  // 同音名同八度
  if (detected.name === targetNote && detected.octave === targetOctave) return true
  // 允许八度误差（大提琴低音区容易检测到高八度）
  if (detected.name === targetNote && Math.abs(detected.octave - targetOctave) === 1) return true
  return false
}

// 预设练习曲
export const PRESET_SONGS: { name: string; notes: { note: string; octave: number; duration?: number }[] }[] = [
  {
    name: '🎵 C大调音阶（上行）',
    notes: [
      { note: 'C', octave: 3 }, { note: 'D', octave: 3 }, { note: 'E', octave: 3 }, { note: 'F', octave: 3 },
      { note: 'G', octave: 3 }, { note: 'A', octave: 3 }, { note: 'B', octave: 3 }, { note: 'C', octave: 4 },
    ]
  },
  {
    name: '🎵 C大调音阶（下行）',
    notes: [
      { note: 'C', octave: 4 }, { note: 'B', octave: 3 }, { note: 'A', octave: 3 }, { note: 'G', octave: 3 },
      { note: 'F', octave: 3 }, { note: 'E', octave: 3 }, { note: 'D', octave: 3 }, { note: 'C', octave: 3 },
    ]
  },
  {
    name: '🎵 空弦练习 (A-D-G-C)',
    notes: [
      { note: 'A', octave: 3 }, { note: 'D', octave: 3 }, { note: 'G', octave: 2 }, { note: 'C', octave: 2 },
      { note: 'C', octave: 2 }, { note: 'G', octave: 2 }, { note: 'D', octave: 3 }, { note: 'A', octave: 3 },
    ]
  },
  {
    name: '🎵 小星星',
    notes: [
      { note: 'C', octave: 3 }, { note: 'C', octave: 3 }, { note: 'G', octave: 3 }, { note: 'G', octave: 3 },
      { note: 'A', octave: 3 }, { note: 'A', octave: 3 }, { note: 'G', octave: 3 },
      { note: 'F', octave: 3 }, { note: 'F', octave: 3 }, { note: 'E', octave: 3 }, { note: 'E', octave: 3 },
      { note: 'D', octave: 3 }, { note: 'D', octave: 3 }, { note: 'C', octave: 3 },
    ]
  },
  {
    name: '🎵 欢乐颂',
    notes: [
      { note: 'E', octave: 3 }, { note: 'E', octave: 3 }, { note: 'F', octave: 3 }, { note: 'G', octave: 3 },
      { note: 'G', octave: 3 }, { note: 'F', octave: 3 }, { note: 'E', octave: 3 }, { note: 'D', octave: 3 },
      { note: 'C', octave: 3 }, { note: 'C', octave: 3 }, { note: 'D', octave: 3 }, { note: 'E', octave: 3 },
      { note: 'E', octave: 3 }, { note: 'D', octave: 3 }, { note: 'D', octave: 3 },
    ]
  },
]

export function usePractice() {
  const notes = ref<NoteItem[]>([])
  const currentIndex = ref(0)
  const isPlaying = ref(false)
  const isCompleted = ref(false)
  const correctCount = ref(0)
  const wrongCount = ref(0)
  const startTime = ref(0)
  const elapsedTime = ref(0)
  const detectedNote = ref('')
  const detectedFreq = ref(0)

  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let rafId: number | null = null
  let timeTimer: number | null = null

  const progress = computed(() =>
    notes.value.length > 0 ? Math.round((currentIndex.value / notes.value.length) * 100) : 0
  )

  const accuracy = computed(() => {
    const total = correctCount.value + wrongCount.value
    return total > 0 ? Math.round((correctCount.value / total) * 100) : 0
  })

  function loadSong(songNotes: { note: string; octave: number; duration?: number }[]) {
    notes.value = songNotes.map(n => ({
      note: `${n.note}${n.octave}`,
      noteName: n.note,
      octave: n.octave,
      frequency: noteToFreq(n.note, n.octave),
      duration: n.duration,
      status: 'pending' as const
    }))
    currentIndex.value = 0
    correctCount.value = 0
    wrongCount.value = 0
    isCompleted.value = false
    elapsedTime.value = 0
  }

  // 从MIDI音符数据加载
  function loadFromMidi(midiNotes: { name: string; octave: number; midi: number }[]) {
    const songNotes = midiNotes.map(n => ({
      note: n.name.replace(/[0-9]/g, ''),
      octave: n.octave
    }))
    loadSong(songNotes)
  }

  // YIN pitch detection (simplified)
  function detectPitch(buffer: Float32Array, sampleRate: number): number {
    let rms = 0
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
    rms = Math.sqrt(rms / buffer.length)
    if (rms < 0.02) return -1

    const halfLen = Math.floor(buffer.length / 2)
    const yin = new Float32Array(halfLen)
    for (let tau = 0; tau < halfLen; tau++) {
      for (let j = 0; j < halfLen; j++) {
        const d = buffer[j] - buffer[j + tau]
        yin[tau] += d * d
      }
    }
    yin[0] = 1
    let sum = 0
    for (let tau = 1; tau < halfLen; tau++) {
      sum += yin[tau]
      yin[tau] *= tau / sum
    }
    for (let tau = 2; tau < halfLen; tau++) {
      if (yin[tau] < 0.1) {
        if (tau + 1 < halfLen) {
          const a = yin[tau - 1], b = yin[tau], c = yin[tau + 1]
          const p = 0.5 * (a - c) / (a - 2 * b + c)
          return sampleRate / (tau + p)
        }
        return sampleRate / tau
      }
    }
    return -1
  }

  let stableNote = ''
  let stableCount = 0
  let waitForAttack = false   // 等待新一弓的起奏（音强上升）
  let rmsMin = 999            // 音强谷值追踪
  let matchedRms = 0          // 上次匹配时的音强

  function getRms(buffer: Float32Array): number {
    let sum = 0
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
    return Math.sqrt(sum / buffer.length)
  }

  function processAudio() {
    if (!isPlaying.value || !analyser || !audioCtx || isCompleted.value) return

    const buffer = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buffer)
    const rms = getRms(buffer)
    const freq = detectPitch(buffer, audioCtx.sampleRate)

    if (freq > 0) {
      const noteInfo = freqToNote(freq)
      if (noteInfo) {
        const noteStr = `${noteInfo.name}${noteInfo.octave}`
        detectedNote.value = noteStr
        detectedFreq.value = Math.round(freq * 10) / 10

        // 连续同音：等待音强先降再升（新一弓/新一次拨弦）
        if (waitForAttack) {
          rmsMin = Math.min(rmsMin, rms)
          // 音强从谷值回升超过阈值，视为新一次起奏
          const attackDetected = rms > rmsMin * 1.8 && rms > 0.03
          // 或者音强下降到很低再回来
          const dipDetected = rmsMin < matchedRms * 0.4

          if (attackDetected || dipDetected) {
            waitForAttack = false
            stableNote = ''
            stableCount = 0
          } else {
            rafId = requestAnimationFrame(processAudio)
            return
          }
        }

        // 稳定性检测——连续3帧相同才判定
        if (noteStr === stableNote) {
          stableCount++
        } else {
          stableCount = 1
          stableNote = noteStr
        }

        if (stableCount >= 3 && currentIndex.value < notes.value.length) {
          const target = notes.value[currentIndex.value]
          if (isNoteMatch(freq, target.noteName, target.octave)) {
            target.status = 'correct'
            correctCount.value++
            matchedRms = rms
            currentIndex.value++
            stableCount = 0
            stableNote = ''

            // 下一个同音 → 等待新的起奏信号
            const next = currentIndex.value < notes.value.length ? notes.value[currentIndex.value] : null
            if (next && next.noteName === target.noteName && next.octave === target.octave) {
              waitForAttack = true
              rmsMin = rms
            }

            // 设置下一个为active
            if (currentIndex.value < notes.value.length) {
              notes.value[currentIndex.value].status = 'active'
            } else {
              isCompleted.value = true
              stop()
            }
          }
        }
      }
    } else {
      detectedNote.value = ''
      detectedFreq.value = 0
      // 无音检测到，说明有间断，可以解除等待
      if (waitForAttack) {
        rmsMin = Math.min(rmsMin, rms)
        if (rms < 0.015) {
          waitForAttack = false
          stableNote = ''
          stableCount = 0
        }
      }
    }

    rafId = requestAnimationFrame(processAudio)
  }

  async function start() {
    if (notes.value.length === 0) return

    // 重置状态
    notes.value.forEach(n => n.status = 'pending')
    currentIndex.value = 0
    correctCount.value = 0
    wrongCount.value = 0
    isCompleted.value = false
    stableNote = ''
    stableCount = 0

    // 标记第一个为active
    notes.value[0].status = 'active'

    // 收集环境信息——失败时一并展示，便于排查
    const envInfo = `[${location.protocol}//${location.host}, secure=${window.isSecureContext}]`

    // HTTPS 校验
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error(`需 HTTPS 访问麦克风。当前 ${envInfo}——请用 https:// 打开。`)
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(`此浏览器无 mediaDevices.getUserMedia API。${envInfo}`)
    }

    // iOS Safari 必须先 resume AudioContext（user gesture 内）
    audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume() } catch {}
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
      })
    } catch (err: any) {
      // 详细错误分类——iOS Safari 常见 DOMException name
      const name = err?.name || ''
      const reason = (() => {
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          return '麦克风权限被拒。iOS 用户：设置 → Safari → 麦克风 → 允许；并清除该网站的权限缓存（地址栏左侧 ⓘ → 网站设置 → 麦克风 → 询问）'
        }
        if (name === 'NotFoundError') return '未检测到麦克风设备'
        if (name === 'NotReadableError') return '麦克风被其他程序占用'
        if (name === 'OverconstrainedError') {
          return '设备不支持指定的音频参数（瑜尝试降级再试）'
        }
        if (name === 'SecurityError') return `安全上下文限制（${envInfo}）`
        if (name === 'TypeError') return '调用 getUserMedia 参数错误'
        return err?.message || '未知错误'
      })()
      throw new Error(`麦克风启用失败 [${name || 'Error'}]: ${reason}`)
    }
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 4096
    source.connect(analyser)

    startTime.value = Date.now()
    isPlaying.value = true

    timeTimer = window.setInterval(() => {
      elapsedTime.value = Math.round((Date.now() - startTime.value) / 1000)
    }, 1000)

    processAudio()
  }

  function stop() {
    isPlaying.value = false
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    if (timeTimer) { clearInterval(timeTimer); timeTimer = null }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
    if (audioCtx) { audioCtx.close(); audioCtx = null }
  }

  function reset() {
    stop()
    notes.value.forEach(n => n.status = 'pending')
    currentIndex.value = 0
    correctCount.value = 0
    wrongCount.value = 0
    isCompleted.value = false
    elapsedTime.value = 0
    detectedNote.value = ''
    detectedFreq.value = 0
  }

  onUnmounted(stop)

  return {
    notes, currentIndex, isPlaying, isCompleted,
    correctCount, wrongCount, progress, accuracy,
    elapsedTime, detectedNote, detectedFreq,
    loadSong, loadFromMidi, start, stop, reset
  }
}
