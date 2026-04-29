<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

interface Props {
  // 完整 XML 内容（已解压的明文 musicxml）
  xml?: string
  // 是否只显示大提琴轨道（默认 true）
  celloOnly?: boolean
  // 是否显示光标
  showCursor?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  xml: '',
  celloOnly: true,
  showCursor: true,
})

const containerRef = ref<HTMLDivElement | null>(null)
const errorMsg = ref('')
let osmd: OpenSheetMusicDisplay | null = null

// 大提琴关键字（不区分大小写）
const CELLO_KEYWORDS = ['violoncello', 'violonchelo', 'violoncelle', 'cello', 'vc.', 'vc', '大提琴']

function isCelloPart(name: string): boolean {
  if (!name) return false
  const lower = name.toLowerCase().trim()
  return CELLO_KEYWORDS.some(k => lower.includes(k))
}

/**
 * 从 MusicXML 中只保留大提琴 part
 * 返回过滤后的 XML 字符串；若没找到大提琴，原样返回
 */
function filterCelloOnly(xmlText: string): string {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlText, 'text/xml')

    // 检查解析错误
    const parseErr = doc.querySelector('parsererror')
    if (parseErr) return xmlText

    // 收集大提琴 part id
    const scoreParts = Array.from(doc.querySelectorAll('score-part'))
    const celloIds = new Set<string>()
    for (const sp of scoreParts) {
      const name = sp.querySelector('part-name')?.textContent || ''
      const abbr = sp.querySelector('part-abbreviation')?.textContent || ''
      const insName =
        sp.querySelector('score-instrument > instrument-name')?.textContent || ''
      if (isCelloPart(name) || isCelloPart(abbr) || isCelloPart(insName)) {
        const id = sp.getAttribute('id')
        if (id) celloIds.add(id)
      }
    }

    if (celloIds.size > 0) {
      // 删除非大提琴的 score-part
      for (const sp of scoreParts) {
        const id = sp.getAttribute('id')
        if (id && !celloIds.has(id)) sp.parentNode?.removeChild(sp)
      }
      // 删除非大提琴的 part 节点
      for (const p of Array.from(doc.querySelectorAll('part'))) {
        const id = p.getAttribute('id')
        if (id && !celloIds.has(id)) p.parentNode?.removeChild(p)
      }
    } else {
      console.warn('[OSMD] 未在曲谱中找到大提琴 part，渲染全部轨道')
    }

    // 清理 MuseScore 导出常见的 width="0.00" 问题——会让 OSMD 时间戳数组为空
    for (const m of Array.from(doc.querySelectorAll('measure[width]'))) {
      const w = parseFloat(m.getAttribute('width') || '0')
      if (!w || w < 1) m.removeAttribute('width')
    }

    return new XMLSerializer().serializeToString(doc)
  } catch (e) {
    console.error('[OSMD] XML 过滤失败:', e)
    return xmlText
  }
}

async function render() {
  if (!containerRef.value || !props.xml) return
  errorMsg.value = ''

  const xmlToRender = props.celloOnly ? filterCelloOnly(props.xml) : props.xml

  // 前置校验：空谱（无音符无休止）OSMD 必崩，提早友好告知
  const pitchCount = (xmlToRender.match(/<pitch[\s>]/g) || []).length
  const restCount = (xmlToRender.match(/<rest[\s/>]/g) || []).length
  if (pitchCount === 0 && restCount === 0) {
    errorMsg.value = '此曲谱无任何音符或休止符（疑似空白模板）。请上传含真实音符的 MusicXML 文件。'
    return
  }

  try {
    if (!osmd) {
      osmd = new OpenSheetMusicDisplay(containerRef.value, {
        autoResize: true,
        backend: 'svg',
        drawTitle: true,
        drawSubtitle: true,
        drawComposer: true,
        drawCredits: false,
        drawPartNames: true,
        // 去掉 'compact' preset——它在某些 MuseScore 导出文件上触发 OSMD 时间戳计算崩溃
      })
    }

    await osmd.load(xmlToRender)
    osmd.render()

    if (props.showCursor && osmd.cursor) {
      try {
        osmd.cursor.show()
        osmd.cursor.reset()
      } catch (e) {
        console.warn('[OSMD] cursor 启用失败（不影响谱面显示）:', e)
      }
    }
  } catch (e: any) {
    console.error('[OSMD] 渲染失败:', e)
    errorMsg.value = `谱面渲染失败：${e?.message || e}`
  }
}

defineExpose({
  next: () => osmd?.cursor?.next(),
  reset: () => osmd?.cursor?.reset(),
  hide: () => osmd?.cursor?.hide(),
  show: () => osmd?.cursor?.show(),
  getCurrentNote: () => {
    const it = osmd?.cursor?.NotesUnderCursor()
    if (!it || it.length === 0) return null
    const n: any = it[0]
    if (!n.Pitch) return null
    return {
      halfTone: n.Pitch.halfTone,
      noteName: n.Pitch.fundamentalNote,
      octave: n.Pitch.octave,
    }
  },
})

watch(() => props.xml, render)
onMounted(render)
onBeforeUnmount(() => {
  try { osmd?.clear() } catch {}
  osmd = null
})
</script>

<template>
  <div class="osmd-wrap">
    <div v-if="!xml" class="osmd-empty">未加载曲谱</div>
    <div v-if="errorMsg" class="osmd-error">{{ errorMsg }}</div>
    <div ref="containerRef" class="osmd-container"></div>
  </div>
</template>

<style scoped>
.osmd-wrap {
  width: 100%;
  background: white;
  border-radius: 12px;
  padding: 12px;
  overflow-x: auto;
}
.osmd-empty {
  color: #94a3b8;
  font-size: 14px;
  text-align: center;
  padding: 24px;
}
.osmd-error {
  color: #dc2626;
  font-size: 13px;
  text-align: center;
  padding: 12px;
  background: #fef2f2;
  border-radius: 8px;
  margin-bottom: 8px;
}
.osmd-container {
  width: 100%;
  min-height: 200px;
}
</style>
