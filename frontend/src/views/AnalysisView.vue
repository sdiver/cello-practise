<script setup lang="ts">
import { ref, computed, onUnmounted, h } from 'vue'
import {
  NCard, NSpace, NButton, NIcon, NGrid, NGi, NStatistic, NTag,
  NProgress, NAlert, NDataTable, NCollapse, NCollapseItem, NText
} from 'naive-ui'
import { CloudUploadOutline, MicOutline, StopCircleOutline } from '@vicons/ionicons5'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart, BarChart, CustomChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, MarkAreaComponent, DataZoomComponent
} from 'echarts/components'
import VChart from 'vue-echarts'
import { analyzeAudio, noteName, type IntonationResult } from '../composables/useIntonation'

use([
  CanvasRenderer, ScatterChart, BarChart, CustomChart,
  GridComponent, TooltipComponent, MarkAreaComponent, DataZoomComponent
])

const fileInput = ref<HTMLInputElement | null>(null)
const audioUrl = ref('')
const analyzing = ref(false)
const progress = ref(0)
const error = ref('')
const result = ref<IntonationResult | null>(null)

const isRecording = ref(false)
const recSeconds = ref(0)
let mediaRecorder: MediaRecorder | null = null
let recStream: MediaStream | null = null
let recTimer: number | null = null
let recChunks: Blob[] = []

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) runAnalysis(file)
  ;(e.target as HTMLInputElement).value = ''
}

async function startRecording() {
  error.value = ''
  try {
    recStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
    })
  } catch {
    error.value = '无法访问麦克风，请检查浏览器权限设置'
    return
  }
  const mime = MediaRecorder.isTypeSupported('audio/mp4')
    ? 'audio/mp4'
    : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
  recChunks = []
  mediaRecorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined)
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data) }
  mediaRecorder.onstop = () => {
    const blob = new Blob(recChunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
    recStream?.getTracks().forEach(t => t.stop())
    recStream = null
    if (recSeconds.value >= 2) runAnalysis(blob)
    else error.value = '录音太短了，至少录 2 秒'
  }
  mediaRecorder.start()
  isRecording.value = true
  recSeconds.value = 0
  recTimer = window.setInterval(() => { recSeconds.value++ }, 1000)
}

function stopRecording() {
  isRecording.value = false
  if (recTimer) { clearInterval(recTimer); recTimer = null }
  mediaRecorder?.stop()
}

async function runAnalysis(blob: Blob) {
  error.value = ''
  result.value = null
  analyzing.value = true
  progress.value = 0
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
  audioUrl.value = URL.createObjectURL(blob)
  try {
    result.value = await analyzeAudio(blob, p => { progress.value = p })
  } catch (e: any) {
    error.value = e?.message || '分析失败，请换一个录音试试（支持 m4a / mp3 / wav 等格式）'
  } finally {
    analyzing.value = false
  }
}

onUnmounted(() => {
  if (isRecording.value) stopRecording()
  if (audioUrl.value) URL.revokeObjectURL(audioUrl.value)
})

function colorFor(rel: number): string {
  const a = Math.abs(rel)
  return a <= 15 ? '#22c55e' : a <= 30 ? '#f59e0b' : '#ef4444'
}

function fmtCents(v: number): string {
  const r = Math.round(v)
  return r > 0 ? `+${r}` : `${r}`
}

const goodPct = computed(() => {
  if (!result.value) return 0
  return Math.round((result.value.counts.good / result.value.segments.length) * 100)
})

// 音高曲线（钢琴卷帘）
const pianoOption = computed(() => {
  const r = result.value
  if (!r) return {}
  const lo = Math.min(...r.segments.map(s => s.target)) - 2
  const hi = Math.max(...r.segments.map(s => s.target)) + 2
  const points: [number, number][] = []
  for (let i = 0; i < r.trackT.length; i++) {
    const m = r.trackMidi[i]
    if (m !== null && m >= lo - 0.5 && m <= hi + 0.5) points.push([r.trackT[i], m])
  }
  const segData = r.segments.map(s => [s.t0, s.t1, s.target + r.globalOffset / 100, Math.round(s.cents - r.globalOffset)])
  return {
    grid: { left: 48, right: 16, top: 16, bottom: 44 },
    xAxis: {
      type: 'value', min: 0, max: Math.ceil(r.duration),
      axisLabel: { formatter: '{value}s' }
    },
    yAxis: {
      type: 'value', min: lo, max: hi, interval: 1,
      axisLabel: { formatter: (v: number) => Number.isInteger(v) ? noteName(v) : '' },
      splitLine: { lineStyle: { color: '#eee' } }
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0 }],
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => p.seriesIndex === 1
        ? `${noteName(p.data[2])}　偏差 ${fmtCents(p.data[3])} 音分`
        : `${p.data[0].toFixed(1)}s`
    },
    series: [
      {
        type: 'scatter', data: points, symbolSize: 3,
        itemStyle: { color: '#4878cf', opacity: 0.5 }, silent: true
      },
      {
        type: 'custom',
        renderItem: (_params: any, api: any) => {
          const start = api.coord([api.value(0), api.value(2)])
          const end = api.coord([api.value(1), api.value(2)])
          return {
            type: 'rect',
            shape: { x: start[0], y: start[1] - 2.5, width: Math.max(2, end[0] - start[0]), height: 5 },
            style: { fill: colorFor(api.value(3) as number) }
          }
        },
        data: segData
      }
    ]
  }
})

// 逐音偏差柱状图
const barOption = computed(() => {
  const r = result.value
  if (!r) return {}
  const rels = r.segments.map(s => Math.round(s.cents - r.globalOffset))
  const minY = Math.min(-50, ...rels) - 10
  const maxY = Math.max(50, ...rels) + 10
  return {
    grid: { left: 48, right: 16, top: 24, bottom: 40 },
    xAxis: {
      type: 'category',
      data: r.segments.map(s => noteName(s.target)),
      axisLabel: { fontSize: 10, interval: r.segments.length > 40 ? 'auto' : 0 }
    },
    yAxis: { type: 'value', min: minY, max: maxY, name: '音分' },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const s = r.segments[p.dataIndex]
        return `${s.t0.toFixed(1)}s　${noteName(s.target)}　时值 ${s.dur.toFixed(1)}s<br/>偏差 ${fmtCents(p.value)} 音分（${p.value > 0 ? '偏高' : p.value < 0 ? '偏低' : '准'}）`
      }
    },
    series: [{
      type: 'bar',
      data: rels.map(v => ({ value: v, itemStyle: { color: colorFor(v) } })),
      markArea: {
        silent: true,
        itemStyle: { color: 'rgba(34, 197, 94, 0.10)' },
        data: [[{ yAxis: -15 }, { yAxis: 15 }]]
      }
    }]
  }
})

const tableColumns = [
  { title: '时间', key: 'time', width: 70 },
  { title: '音名', key: 'note', width: 64 },
  { title: '时值', key: 'dur', width: 70 },
  {
    title: '偏差', key: 'rel', width: 110,
    render: (row: any) => h(NTag, {
      size: 'small',
      type: Math.abs(row.rel) <= 15 ? 'success' : Math.abs(row.rel) <= 30 ? 'warning' : 'error'
    }, () => `${fmtCents(row.rel)} 音分`)
  },
  { title: '稳定度', key: 'spread' },
]

const tableData = computed(() => {
  const r = result.value
  if (!r) return []
  return r.segments.map((s, i) => ({
    key: i,
    time: `${s.t0.toFixed(1)}s`,
    note: noteName(s.target),
    dur: `${s.dur.toFixed(1)}s`,
    rel: Math.round(s.cents - r.globalOffset),
    spread: s.spread <= 15 ? '稳' : s.spread <= 30 ? '略晃' : '晃动大'
  }))
})
</script>

<template>
  <n-space vertical :size="20">
    <n-card>
      <n-text style="font-size: 20px" strong>🎯 录音分析</n-text>
      <n-text depth="3" style="display: block; margin-top: 6px; font-size: 13px">
        上传一段练习录音（或现场录一段），自动检测每个音的音准，生成图表和练习建议。
      </n-text>
    </n-card>

    <!-- 输入区 -->
    <n-card>
      <input ref="fileInput" type="file" accept="audio/*" style="display: none" @change="onFileChange" />
      <n-space :size="12">
        <n-button type="primary" size="large" :disabled="analyzing || isRecording" @click="pickFile">
          <template #icon><n-icon><CloudUploadOutline /></n-icon></template>
          选择录音文件
        </n-button>
        <n-button v-if="!isRecording" size="large" :disabled="analyzing" @click="startRecording">
          <template #icon><n-icon><MicOutline /></n-icon></template>
          现场录一段
        </n-button>
        <n-button v-else type="error" size="large" @click="stopRecording">
          <template #icon><n-icon><StopCircleOutline /></n-icon></template>
          停止录音（{{ recSeconds }}s）
        </n-button>
      </n-space>

      <div v-if="isRecording" class="rec-hint">
        <span class="rec-dot"></span>正在录音…离琴 1 米左右效果最好
      </div>

      <audio v-if="audioUrl && !isRecording" :src="audioUrl" controls class="player"></audio>

      <n-progress
        v-if="analyzing"
        type="line"
        :percentage="progress"
        indicator-placement="inside"
        processing
        style="margin-top: 14px"
      />

      <n-alert v-if="error" type="warning" style="margin-top: 14px" :show-icon="true">
        {{ error }}
      </n-alert>
    </n-card>

    <template v-if="result">
      <!-- 统计卡片 -->
      <n-grid :cols="4" :x-gap="14" :y-gap="14" responsive="screen" cols-s="2" cols-xs="2">
        <n-gi>
          <n-card class="stat-card">
            <n-statistic label="🎵 检测到的音符" :value="result.segments.length" />
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="stat-card">
            <n-statistic label="🎯 音准率（±15音分）">
              <span :style="{ color: goodPct >= 70 ? '#22c55e' : goodPct >= 40 ? '#f59e0b' : '#ef4444' }">
                {{ goodPct }}%
              </span>
            </n-statistic>
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="stat-card">
            <n-statistic label="🔧 整体调音偏移" :value="`${fmtCents(result.globalOffset)} 音分`" />
          </n-card>
        </n-gi>
        <n-gi>
          <n-card class="stat-card">
            <n-statistic label="🎻 长音稳定度" :value="result.avgSpread <= 20 ? '稳' : result.avgSpread <= 30 ? '中等' : '偏晃'" />
          </n-card>
        </n-gi>
      </n-grid>

      <!-- 调弦检查 -->
      <n-card v-if="result.openStrings.length" title="🔍 空弦检查（弦本身准不准）">
        <n-space :size="10">
          <n-tag
            v-for="o in result.openStrings"
            :key="o.name"
            size="large"
            :type="Math.abs(o.median) < 12 ? 'success' : Math.abs(o.median) <= 25 ? 'warning' : 'error'"
          >
            {{ o.name }}：{{ Math.abs(o.median) < 12 ? '准' : `偏${o.median > 0 ? '高' : '低'} ${Math.round(Math.abs(o.median))} 音分` }}
          </n-tag>
        </n-space>
        <n-text depth="3" style="display: block; margin-top: 10px; font-size: 12px">
          按检测到的 C2 / G2 / D3 / A3 统计——低把位时这些音通常是空弦。如果显示偏差大，先用调音器调弦。
        </n-text>
      </n-card>

      <!-- 音高曲线 -->
      <n-card title="📈 音高曲线">
        <template #header-extra>
          <n-text depth="3" style="font-size: 12px">绿=准 橙=略偏 红=明显偏 · 可双指缩放</n-text>
        </template>
        <v-chart class="chart-tall" :option="pianoOption" autoresize />
      </n-card>

      <!-- 逐音偏差 -->
      <n-card title="📊 逐音偏差（已扣除整体调音偏移）">
        <template #header-extra>
          <n-text depth="3" style="font-size: 12px">绿色区域 = ±15 音分内</n-text>
        </template>
        <v-chart class="chart" :option="barOption" autoresize />
      </n-card>

      <!-- 建议 -->
      <n-card class="advice-card" title="💡 练习建议">
        <div class="advice-list">
          <div v-for="(a, i) in result.advice" :key="i" class="advice-item">{{ a }}</div>
        </div>
        <n-text depth="3" style="display: block; margin-top: 12px; font-size: 12px">
          注：分析以最近的半音为目标音，偏差超过半个半音的音会被归到相邻音上；换把滑音和很短的音仅供参考。
        </n-text>
      </n-card>

      <!-- 明细表 -->
      <n-card>
        <n-collapse>
          <n-collapse-item title="📋 每个音的明细" name="detail">
            <n-data-table
              :columns="tableColumns"
              :data="tableData"
              size="small"
              :bordered="false"
              :pagination="{ pageSize: 15 }"
            />
          </n-collapse-item>
        </n-collapse>
      </n-card>
    </template>
  </n-space>
</template>

<style scoped>
.player {
  display: block;
  width: 100%;
  margin-top: 14px;
}

.rec-hint {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, #64748b);
  font-size: 14px;
}

.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  animation: blink 1s infinite;
}

@keyframes blink {
  50% { opacity: 0.2; }
}

.stat-card { text-align: center; }

.chart { height: 320px; }
.chart-tall { height: 380px; }

.advice-card { border-left: 4px solid #6366f1 !important; }
.advice-list { display: flex; flex-direction: column; gap: 10px; }
.advice-item {
  font-size: 14px;
  color: var(--text-secondary, #475569);
  line-height: 1.7;
}

@media (max-width: 768px) {
  .chart { height: 260px; }
  .chart-tall { height: 300px; }
}
</style>
