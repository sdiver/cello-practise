<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

interface NoteData {
  noteName: string
  octave: number
  status: 'pending' | 'active' | 'correct' | 'wrong'
}

const props = defineProps<{
  notes: NoteData[]
  currentIndex: number
}>()

const containerRef = ref<HTMLDivElement>()

// VexFlow 音名映射
function toVexKey(name: string, octave: number): string {
  return `${name.toLowerCase()}/${octave}`
}

function getNoteColor(status: string): string {
  switch (status) {
    case 'correct': return '#27ae60'
    case 'active': return '#3498db'
    case 'wrong': return '#e74c3c'
    default: return '#999'
  }
}

function renderStaff() {
  if (!containerRef.value || props.notes.length === 0) return

  // 清空
  containerRef.value.innerHTML = ''

  const notesPerLine = 8
  const totalLines = Math.ceil(props.notes.length / notesPerLine)
  const width = Math.min(containerRef.value.clientWidth, 900)
  const staveWidth = width - 40
  const lineHeight = 100
  const totalHeight = totalLines * lineHeight + 60

  const renderer = new Renderer(containerRef.value, Renderer.Backends.SVG)
  renderer.resize(width, totalHeight)
  const context = renderer.getContext()
  context.setFont('Arial', 10)

  for (let line = 0; line < totalLines; line++) {
    const startIdx = line * notesPerLine
    const lineNotes = props.notes.slice(startIdx, startIdx + notesPerLine)
    const y = line * lineHeight + 10

    // 大提琴用低音谱号
    const stave = new Stave(20, y, staveWidth)
    if (line === 0) {
      stave.addClef('bass')
    }
    stave.setContext(context).draw()

    if (lineNotes.length === 0) continue

    const vexNotes = lineNotes.map((n) => {
      const key = toVexKey(n.noteName, n.octave)
      const note = new StaveNote({
        keys: [key],
        duration: 'q',
        clef: 'bass',
      })

      // 升降号
      if (n.noteName.includes('#')) {
        note.addModifier(new Accidental('#'))
      } else if (n.noteName.includes('b')) {
        note.addModifier(new Accidental('b'))
      }

      // 颜色
      const color = getNoteColor(n.status)
      note.setStyle({ fillStyle: color, strokeStyle: color })

      return note
    })

    const voice = new Voice({
      numBeats: lineNotes.length,
      beatValue: 4,
    })
    voice.setStrict(false)
    voice.addTickables(vexNotes)

    new Formatter().joinVoices([voice]).format([voice], staveWidth - 60)
    voice.draw(context, stave)
  }
}

onMounted(() => {
  nextTick(renderStaff)
})

watch(() => [props.notes, props.currentIndex], () => {
  nextTick(renderStaff)
}, { deep: true })
</script>

<template>
  <div ref="containerRef" class="staff-container" />
</template>

<style scoped>
.staff-container {
  width: 100%;
  overflow-x: auto;
  min-height: 120px;
}
.staff-container :deep(svg) {
  max-width: 100%;
}
</style>
