import { ref, onUnmounted } from 'vue'

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function noteFromFrequency(freq: number) {
  if (freq <= 0) return { note: '--', octave: 0, cents: 0 }
  const A4 = 440
  const C0 = A4 * Math.pow(2, -4.75)
  const halfSteps = 12 * Math.log2(freq / C0)
  const octave = Math.floor(halfSteps / 12)
  const noteIndex = Math.round(halfSteps) % 12
  const cents = Math.round((halfSteps - Math.round(halfSteps)) * 100)
  return { note: NOTE_NAMES[(noteIndex + 12) % 12], octave, cents }
}

class YINDetector {
  sampleRate: number
  threshold = 0.1

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate
  }

  detect(buffer: Float32Array) {
    let rms = 0
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
    rms = Math.sqrt(rms / buffer.length)
    // 移动端 8x GainNode 放大后，RMS 已自然提升；阈值仍按桌面 0.02 不必再降
    // （此处函数签名不易拿 isMobile，统一用 0.005 兼顾两端）
    if (rms < 0.005) return { frequency: -1, confidence: 0, rms }

    const halfLen = buffer.length / 2
    const yinBuffer = new Float32Array(halfLen)

    for (let tau = 0; tau < halfLen; tau++) {
      yinBuffer[tau] = 0
      for (let j = 0; j < halfLen; j++) {
        const delta = buffer[j] - buffer[j + tau]
        yinBuffer[tau] += delta * delta
      }
    }

    yinBuffer[0] = 1
    let runningSum = 0
    for (let tau = 1; tau < halfLen; tau++) {
      runningSum += yinBuffer[tau]
      yinBuffer[tau] *= tau / runningSum
    }

    let tauEstimate = -1
    for (let tau = 2; tau < halfLen; tau++) {
      if (yinBuffer[tau] < this.threshold) {
        if (tau + 1 < halfLen && tau > 0) {
          const alpha = yinBuffer[tau - 1]
          const beta = yinBuffer[tau]
          const gamma = yinBuffer[tau + 1]
          const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma)
          tauEstimate = tau + p
        } else {
          tauEstimate = tau
        }
        break
      }
    }

    if (tauEstimate === -1) return { frequency: -1, confidence: 0, rms }
    return {
      frequency: this.sampleRate / tauEstimate,
      confidence: 1 - yinBuffer[Math.round(tauEstimate)],
      rms
    }
  }
}

export function useTuner() {
  const isRunning = ref(false)
  const currentNote = ref('--')
  const currentOctave = ref(0)
  const currentFreq = ref(0)
  const currentCents = ref(0)
  const confidence = ref(0)
  const status = ref<'idle' | 'sharp' | 'flat' | 'in-tune'>('idle')

  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let detector: YINDetector | null = null
  let rafId: number | null = null
  let lastNote = ''
  let stableCount = 0

  function processAudio() {
    if (!isRunning.value || !analyser || !detector) return
    const buffer = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buffer)

    const result = detector.detect(buffer)
    if (result.frequency > 0 && result.confidence > 0.7) {
      const info = noteFromFrequency(result.frequency)
      if (info.note === lastNote) {
        stableCount++
      } else {
        stableCount = 0
        lastNote = info.note
      }

      if (stableCount > 3) {
        currentNote.value = info.note
        currentOctave.value = info.octave
        currentFreq.value = Math.round(result.frequency * 10) / 10
        currentCents.value = info.cents
        confidence.value = Math.round(result.confidence * 100)

        if (Math.abs(info.cents) < 5) status.value = 'in-tune'
        else if (info.cents < 0) status.value = 'flat'
        else status.value = 'sharp'
      }
    }

    rafId = requestAnimationFrame(processAudio)
  }

  async function start() {
    try {
      // 移动端检测——iPad/iPhone/Android 麦克风灵敏度低，需 AGC + 软放大
      const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))

      audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') {
        try { await audioCtx.resume() } catch {}
      }
      detector = new YINDetector(audioCtx.sampleRate)
      stream = await navigator.mediaDevices.getUserMedia({
        audio: isMobile
          ? { echoCancellation: false, autoGainControl: true, noiseSuppression: false }
          : { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
      })
      const source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 4096
      // 移动端额外加 GainNode 8x 放大
      if (isMobile) {
        const gainNode = audioCtx.createGain()
        gainNode.gain.value = 8
        source.connect(gainNode)
        gainNode.connect(analyser)
      } else {
        source.connect(analyser)
      }
      isRunning.value = true
      processAudio()
    } catch (e) {
      console.error('调音器启动失败:', e)
      // 清理已创建的资源
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
      if (audioCtx) { audioCtx.close(); audioCtx = null }
      throw e
    }
  }

  function stop() {
    isRunning.value = false
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
    if (audioCtx) { audioCtx.close(); audioCtx = null }
    currentNote.value = '--'
    currentFreq.value = 0
    currentCents.value = 0
    status.value = 'idle'
    stableCount = 0
  }

  function toggle() {
    isRunning.value ? stop() : start()
  }

  onUnmounted(stop)

  return {
    isRunning, currentNote, currentOctave, currentFreq, currentCents,
    confidence, status, start, stop, toggle
  }
}

export function playReferenceNote(freq: number, duration = 2) {
  const ctx = new AudioContext()
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  osc1.frequency.value = freq
  osc1.type = 'sawtooth'
  osc2.frequency.value = freq * 2
  osc2.type = 'sine'

  filter.type = 'lowpass'
  filter.frequency.value = freq * 3

  osc1.connect(filter)
  osc2.connect(gain)
  filter.connect(gain)
  gain.connect(ctx.destination)

  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

  osc1.start(); osc2.start()
  osc1.stop(ctx.currentTime + duration)
  osc2.stop(ctx.currentTime + duration)
}
