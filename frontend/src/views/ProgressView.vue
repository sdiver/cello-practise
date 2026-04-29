<script setup lang="ts">
import {
  NCard, NSpace, NStatistic, NGrid, NGi, NText, NEmpty,
  NSelect, NDataTable, NTag, NProgress
} from 'naive-ui'
import { ref, onMounted, watch, h } from 'vue'
import { api } from '../api'

const period = ref('30')
const periodOptions = [
  { label: '最近7天', value: '7' },
  { label: '最近30天', value: '30' },
  { label: '最近90天', value: '90' },
]

const stats = ref<any>({
  total_sessions: 0, total_duration: 0, avg_score: 0,
  avg_pitch: 0, avg_rhythm: 0, avg_expression: 0, practice_days: 0, best_score: 0
})
const dailyStats = ref<any[]>([])
const sheetStats = ref<any[]>([])
const records = ref<any[]>([])

const recordColumns = [
  { title: '日期', key: 'practice_date', width: 100 },
  { title: '曲目', key: 'sheet_title', ellipsis: { tooltip: true } },
  {
    title: '总分', key: 'total_score', width: 80,
    render: (row: any) => h(NTag, {
      type: row.total_score >= 90 ? 'success' : row.total_score >= 70 ? 'warning' : 'error',
      size: 'small'
    }, () => row.total_score || '--')
  },
  { title: '音准', key: 'pitch_score', width: 60 },
  { title: '节奏', key: 'rhythm_score', width: 60 },
  { title: '表现力', key: 'expression_score', width: 70 },
  {
    title: '时长', key: 'duration', width: 80,
    render: (row: any) => `${Math.round((row.duration || 0) / 60)}分钟`
  },
]

async function loadData() {
  try {
    const [statsResult, recordsResult] = await Promise.all([
      api.getPracticeStats(1, parseInt(period.value)),
      api.getPracticeRecords(1, { limit: 20 })
    ])

    stats.value = statsResult.overall || {}
    dailyStats.value = statsResult.daily || []
    sheetStats.value = statsResult.sheets || []
    records.value = recordsResult.data || []
  } catch (e) {
    // ignore
  }
}

watch(period, loadData)
onMounted(loadData)

function formatDuration(seconds: number) {
  if (!seconds) return '0'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分`
}
</script>

<template>
  <n-space vertical :size="20">
    <n-card>
      <n-space justify="space-between" align="center">
        <n-text style="font-size: 20px" strong>📈 练习进度</n-text>
        <n-select v-model:value="period" :options="periodOptions" style="width: 140px" />
      </n-space>
    </n-card>

    <!-- 统计卡片 -->
    <n-grid :cols="4" :x-gap="16" :y-gap="16">
      <n-gi>
        <n-card>
          <n-statistic label="🎵 练习次数" :value="stats.total_sessions || 0" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic label="⏱️ 练习时长" :value="formatDuration(stats.total_duration || 0)" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic label="📊 平均分数" :value="Math.round(stats.avg_score || 0)" />
        </n-card>
      </n-gi>
      <n-gi>
        <n-card>
          <n-statistic label="🏆 最高分" :value="stats.best_score || 0" />
        </n-card>
      </n-gi>
    </n-grid>

    <!-- 分项平均 -->
    <n-card title="📊 各项平均分">
      <n-grid :cols="3" :x-gap="24">
        <n-gi v-for="item in [
          { label: '🎯 音准', value: stats.avg_pitch, color: '#3498db' },
          { label: '🥁 节奏', value: stats.avg_rhythm, color: '#e74c3c' },
          { label: '🎭 表现力', value: stats.avg_expression, color: '#2ecc71' },
        ]" :key="item.label">
          <n-space vertical :size="4">
            <n-space justify="space-between">
              <n-text>{{ item.label }}</n-text>
              <n-text strong>{{ Math.round(item.value || 0) }}</n-text>
            </n-space>
            <n-progress
              :percentage="Math.round(item.value || 0)"
              :color="item.color"
              :height="8"
              :border-radius="4"
              :show-indicator="false"
            />
          </n-space>
        </n-gi>
      </n-grid>
    </n-card>

    <!-- 常练曲目 -->
    <n-card v-if="sheetStats.length" title="🎼 常练曲目">
      <n-grid :cols="2" :x-gap="16" :y-gap="12">
        <n-gi v-for="s in sheetStats" :key="s.id">
          <n-card size="small" embedded>
            <n-space justify="space-between" align="center">
              <div>
                <n-text strong>{{ s.title }}</n-text>
                <br />
                <n-text depth="3" style="font-size: 12px">{{ s.composer }} · 练习{{ s.practice_count }}次</n-text>
              </div>
              <n-tag :type="s.avg_score >= 80 ? 'success' : 'warning'" size="small">
                均分 {{ Math.round(s.avg_score || 0) }}
              </n-tag>
            </n-space>
          </n-card>
        </n-gi>
      </n-grid>
    </n-card>

    <!-- 练习记录表 -->
    <n-card title="📋 练习记录">
      <n-data-table
        v-if="records.length"
        :columns="recordColumns"
        :data="records"
        :bordered="false"
        size="small"
        :pagination="{ pageSize: 10 }"
      />
      <n-empty v-else description="还没有练习记录，开始练习吧！" />
    </n-card>
  </n-space>
</template>
