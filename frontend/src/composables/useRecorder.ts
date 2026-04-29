import { ref, onUnmounted } from 'vue'

interface PitchPoint {
  time: number
  frequency: number
  note: string
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

function noteFromFreq(freq: number): string {
  if (freq <= 0) return '--'
  const A4 = 440
  const C0 = A4 * Math.pow(2, -4.75)
  const halfSteps = 12 * Math.log2(freq / C0)
  const noteIndex = Math.round(halfSteps) % 12
  return NOTE_NAMES[(noteIndex + 12) % 12]
}

export function useRecorder() {
  const isRecording = ref(false)
  const duration = ref(0)
  const pitchData = ref<PitchPoint[]>([])

  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let rafId: number | null = null
  let startTime = 0
  let durationTimer: number | null = null

  function detectPitch(buffer: Float32Array, sampleRate: number): number {
    let rms = 0
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i]
    rms = Math.sqrt(rms / buffer.length)
    if (rms < 0.02) return -1

    const halfLen = buffer.length / 2
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

  function processAudio() {
    if (!isRecording.value || !analyser || !audioCtx) return

    const buffer = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buffer)
    const freq = detectPitch(buffer, audioCtx.sampleRate)

    if (freq > 0) {
      pitchData.value.push({
        time: (Date.now() - startTime) / 1000,
        frequency: freq,
        note: noteFromFreq(freq)
      })
    }

    rafId = requestAnimationFrame(processAudio)
  }

  async function start() {
    pitchData.value = []
    duration.value = 0

    audioCtx = new AudioContext()
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false }
    })

    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 4096
    source.connect(analyser)

    startTime = Date.now()
    isRecording.value = true

    durationTimer = window.setInterval(() => {
      duration.value = Math.round((Date.now() - startTime) / 1000)
    }, 1000)

    processAudio()
  }

  function stop() {
    isRecording.value = false
    if (rafId) { cancelAnimationFrame(rafId); rafId = null }
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
    if (audioCtx) { audioCtx.close(); audioCtx = null }
    duration.value = Math.round((Date.now() - startTime) / 1000)
  }

  onUnmounted(() => { if (isRecording.value) stop() })

  return { isRecording, duration, pitchData, start, stop }
}
