<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Dot, Beam } from 'vexflow'
import { splitToMeasures, keyToVexKey, type MidiNote, type StaffNoteSpec } from './midiToStaff'

interface Props {
  notes: MidiNote[]
  bpm?: number
  timeSignature?: [number, number]
  keySignature?: string
  keyScale?: string
  ppq?: number
  // 当前高亮的音符在原始 notes 数组中的索引，-1 = 不高亮
  currentIndex?: number
  // 每行多少小节
  measuresPerLine?: number
}

const props = withDefaults(defineProps<Props>(), {
  bpm: 120,
  timeSignature: () => [4, 4] as [number, number],
  keySignature: 'C',
  keyScale: 'major',
  ppq: 480,
  currentIndex: -1,
  measuresPerLine: 4,
})

const containerRef = ref<HTMLDivElement | null>(null)
const errorMsg = ref('')

// 每个音符元素 → 对应原始音符索引（用于高亮）
const noteElementMap = new Map<number, SVGElement[]>()

function clearContainer() {
  if (containerRef.value) containerRef.value.innerHTML = ''
  noteElementMap.clear()
}

function buildVexNote(spec: StaffNoteSpec, clef: string): StaveNote {
  // duration: 'q' / 'qd'(附点四分) / 'qr'(休止)
  const note = new StaveNote({
    keys: spec.keys,
    duration: spec.duration,
    clef,
  })
  // 升降号
  spec.accidentals.forEach((acc, i) => {
    if (acc) note.addModifier(new Accidental(acc), i)
  })
  // 附点
  const dotCount = (spec.duration.match(/d/g) || []).length
  for (let i = 0; i < dotCount; i++) {
    Dot.buildAndAttach([note], { all: true })
  }
  return note
}

function render() {
  if (!containerRef.value) return
  errorMsg.value = ''
  clearContainer()

  if (!props.notes || props.notes.length === 0) {
    errorMsg.value = '此曲无音符'
    return
  }

  try {
    const measures = splitToMeasures(props.notes, props.ppq, props.timeSignature)
    if (measures.length === 0) {
      errorMsg.value = '无法切分小节'
      return
    }

    const clef = 'bass' // 大提琴用低音谱号
    const vexKey = keyToVexKey(props.keySignature, props.keyScale)
    const timeSig = `${props.timeSignature[0]}/${props.timeSignature[1]}`

    const containerWidth = containerRef.value.clientWidth || 800
    const measuresPerLine = props.measuresPerLine
    const lineHeight = 160 // 加大行间距，让音符不挤压
    const measureWidth = Math.floor((containerWidth - 40) / measuresPerLine)
    const startX = 20
    const startY = 30
    const totalLines = Math.ceil(measures.length / measuresPerLine)
    const totalHeight = totalLines * lineHeight + 60

    const renderer = new Renderer(containerRef.value, Renderer.Backends.SVG)
    renderer.resize(containerWidth, totalHeight)
    const ctx = renderer.getContext()

    measures.forEach((measure, mIdx) => {
      const lineIdx = Math.floor(mIdx / measuresPerLine)
      const colIdx = mIdx % measuresPerLine
      const x = startX + colIdx * measureWidth
      const y = startY + lineIdx * lineHeight

      // 行首小节加谱号、调号、拍号
      const isLineHead = colIdx === 0
      const stave = new Stave(x, y, measureWidth)
      if (isLineHead && lineIdx === 0) {
        stave.addClef(clef).addKeySignature(vexKey).addTimeSignature(timeSig)
      } else if (isLineHead) {
        stave.addClef(clef).addKeySignature(vexKey)
      }
      stave.setContext(ctx).draw()

      // 构建 voice
      const vexNotes = measure.notes.map(spec => {
        const note = buildVexNote(spec, clef)
        return { spec, note }
      })

      const voice = new Voice({
        numBeats: props.timeSignature[0],
        beatValue: props.timeSignature[1],
      }).setMode(Voice.Mode.SOFT)

      voice.addTickables(vexNotes.map(v => v.note))

      try {
        new Formatter()
          .joinVoices([voice])
          .format([voice], measureWidth - (isLineHead ? 80 : 20))
      } catch (e) {
        console.warn('[VexFlow] 小节 format 失败:', mIdx, e)
      }

      // 自动连音符
      const beams = Beam.generateBeams(vexNotes.filter(v => !v.spec.isRest).map(v => v.note))

      voice.draw(ctx, stave)
      beams.forEach(b => b.setContext(ctx).draw())

      // 收集 SVG 元素用于高亮
      vexNotes.forEach(({ spec, note }) => {
        if (spec.originalIndex < 0) return
        const svgEl = (note as any).getAttribute?.('el') as SVGElement | undefined
        if (svgEl) {
          if (!noteElementMap.has(spec.originalIndex)) {
            noteElementMap.set(spec.originalIndex, [])
          }
          noteElementMap.get(spec.originalIndex)!.push(svgEl)
        }
      })
    })
  } catch (e: any) {
    console.error('[MidiSheet] 渲染失败:', e)
    errorMsg.value = `谱面渲染失败：${e?.message || e}`
  }
}

function applyHighlight() {
  // 清除所有高亮
  noteElementMap.forEach(els => {
    els.forEach(el => {
      el.querySelectorAll('*').forEach(c => (c as SVGElement).style.fill = '')
      ;(el as SVGElement).style.fill = ''
    })
  })
  // 应用当前高亮
  if (props.currentIndex >= 0) {
    const els = noteElementMap.get(props.currentIndex)
    if (els && els.length) {
      els.forEach(el => {
        el.querySelectorAll('*').forEach(c => (c as SVGElement).style.fill = '#3b82f6')
        ;(el as SVGElement).style.fill = '#3b82f6'
      })
      // 自动滚屏：把当前音符滚到视口中部
      scrollNoteIntoView(els[0])
    }
  }
}

function scrollNoteIntoView(noteEl: SVGElement) {
  const container = containerRef.value
  if (!container) return
  try {
    const noteRect = noteEl.getBoundingClientRect()
    const cRect = container.getBoundingClientRect()
    // 当前音符在容器内的 top 偏移
    const offsetTop = noteRect.top - cRect.top + container.scrollTop
    // 目标：让音符位于容器视口中线
    const target = offsetTop - container.clientHeight / 2 + noteRect.height / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  } catch {
    // 兜底
    noteEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

watch(() => props.notes, () => nextTick(render), { deep: false })
watch(() => props.currentIndex, applyHighlight)

onMounted(() => {
  nextTick(render)
})

onBeforeUnmount(clearContainer)

// 暴露 reload 方法
defineExpose({ reload: render })
</script>

<template>
  <div class="midi-sheet-wrap">
    <div v-if="errorMsg" class="sheet-error">{{ errorMsg }}</div>
    <div ref="containerRef" class="sheet-container"></div>
  </div>
</template>

<style scoped>
.midi-sheet-wrap {
  width: 100%;
  background: white;
  border-radius: 12px;
  padding: 12px;
}
.sheet-error {
  color: #dc2626;
  font-size: 13px;
  text-align: center;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
  margin-bottom: 8px;
}
/* 滚屏视口：固定高度 ≈ 2 行五线谱（lineHeight 160 × 2 + padding） */
.sheet-container {
  width: 100%;
  max-height: 360px;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  /* 渐隐边缘提示有更多内容 */
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 8%,
    black 92%,
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    black 8%,
    black 92%,
    transparent 100%
  );
}
.sheet-container :deep(svg) {
  display: block;
  margin: 0 auto;
}
/* 滚动条美化 */
.sheet-container::-webkit-scrollbar { width: 6px; }
.sheet-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
.sheet-container::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
