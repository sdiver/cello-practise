import { ref, onUnmounted } from 'vue'

export function useMetronome() {
  const bpm = ref(80)
  const isPlaying = ref(false)
  const currentBeat = ref(0)
  const beatsPerMeasure = ref(4)

  let audioCtx: AudioContext | null = null
  let timerId: number | null = null
  let nextBeatTime = 0
  let beatCount = 0

  function playClick(time: number, isAccent: boolean) {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    osc.frequency.value = isAccent ? 1000 : 800
    osc.type = 'square'

    gain.gain.setValueAtTime(isAccent ? 0.3 : 0.15, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05)

    osc.start(time)
    osc.stop(time + 0.05)
  }

  function scheduler() {
    if (!audioCtx || !isPlaying.value) return
    const interval = 60 / bpm.value

    while (nextBeatTime < audioCtx.currentTime + 0.1) {
      const isAccent = beatCount % beatsPerMeasure.value === 0
      playClick(nextBeatTime, isAccent)
      currentBeat.value = (beatCount % beatsPerMeasure.value) + 1
      nextBeatTime += interval
      beatCount++
    }

    timerId = window.setTimeout(scheduler, 25)
  }

  function start() {
    audioCtx = new AudioContext()
    beatCount = 0
    currentBeat.value = 0
    nextBeatTime = audioCtx.currentTime
    isPlaying.value = true
    scheduler()
  }

  function stop() {
    isPlaying.value = false
    if (timerId) { clearTimeout(timerId); timerId = null }
    if (audioCtx) { audioCtx.close(); audioCtx = null }
    currentBeat.value = 0
  }

  function toggle() {
    isPlaying.value ? stop() : start()
  }

  onUnmounted(stop)

  return { bpm, isPlaying, currentBeat, beatsPerMeasure, start, stop, toggle }
}
