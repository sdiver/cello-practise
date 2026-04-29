<script setup lang="ts">
import { NCard, NSpace, NGrid, NGi, NText, NIcon } from 'naive-ui'
import { MusicalNotesOutline, MicOutline, DocumentTextOutline, ChatbubblesOutline } from '@vicons/ionicons5'
import { useRouter } from 'vue-router'
import { ref, onMounted } from 'vue'
import { api } from '../api'

const router = useRouter()

const stats = ref({ total_sessions: 0, total_duration: 0, avg_score: 0 })
const sheetsCount = ref(0)

const quickActions = [
  { label: '调音器', desc: '校准四根弦', icon: MusicalNotesOutline, route: 'tuner', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
  { label: '跟练', desc: '弹对亮灯', icon: MicOutline, route: 'practice', gradient: 'linear-gradient(135deg, #ef4444, #f97316)' },
  { label: '曲谱库', desc: '浏览搜索', icon: DocumentTextOutline, route: 'sheets', gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
  { label: 'AI教练', desc: '随时提问', icon: ChatbubblesOutline, route: 'chat', gradient: 'linear-gradient(135deg, #8b5cf6, #a855f7)' },
]

const statCards = [
  { label: '本周练习', suffix: '次', key: 'total_sessions', icon: '🎵' },
  { label: '练习时长', suffix: '分钟', key: 'duration', icon: '⏱️' },
  { label: '平均分数', suffix: '', key: 'avg_score', icon: '📊' },
  { label: '曲谱数量', suffix: '首', key: 'sheets', icon: '🎼' },
]

onMounted(async () => {
  try {
    const [s, sh] = await Promise.all([
      api.getPracticeStats(1, 7).catch(() => ({ overall: {} })),
      api.getSheets({ limit: 1 }).catch(() => ({ pagination: { total: 0 } }))
    ])
    stats.value = s.overall || {}
    sheetsCount.value = sh.pagination?.total || 0
  } catch {}
})

function getStatValue(key: string) {
  if (key === 'duration') return Math.round((stats.value.total_duration || 0) / 60)
  if (key === 'sheets') return sheetsCount.value
  if (key === 'avg_score') return Math.round(stats.value.avg_score || 0) || '--'
  return (stats.value as any)[key] || 0
}
</script>

<template>
  <n-space vertical :size="20">
    <!-- 欢迎横幅 -->
    <div class="welcome-banner">
      <div class="welcome-text">
        <h2>👋 你好，齐齐！</h2>
        <p>今天也要好好练琴哦～</p>
      </div>
      <div class="welcome-emoji">🎻</div>
    </div>

    <!-- 快捷入口 -->
    <n-grid :cols="4" :x-gap="14" :y-gap="14" responsive="screen" cols-s="2" cols-xs="2">
      <n-gi v-for="action in quickActions" :key="action.route">
        <div
          class="action-card"
          :style="{ background: action.gradient }"
          @click="router.push({ name: action.route })"
        >
          <n-icon :size="32" color="rgba(255,255,255,0.9)">
            <component :is="action.icon" />
          </n-icon>
          <span class="action-label">{{ action.label }}</span>
          <span class="action-desc">{{ action.desc }}</span>
        </div>
      </n-gi>
    </n-grid>

    <!-- 统计卡片 -->
    <n-grid :cols="4" :x-gap="14" :y-gap="14" responsive="screen" cols-s="2" cols-xs="2">
      <n-gi v-for="s in statCards" :key="s.key">
        <n-card class="stat-card">
          <div class="stat-icon">{{ s.icon }}</div>
          <div class="stat-value">{{ getStatValue(s.key) }}<span class="stat-suffix">{{ s.suffix }}</span></div>
          <div class="stat-label">{{ s.label }}</div>
        </n-card>
      </n-gi>
    </n-grid>

    <!-- 今日建议 -->
    <n-card class="tips-card">
      <div class="tips-title">💡 今日练习建议</div>
      <div class="tips-list">
        <div class="tip-item"><span class="tip-num">1</span>先用调音器检查四根弦的音准</div>
        <div class="tip-item"><span class="tip-num">2</span>开着节拍器做10分钟空弦长弓练习</div>
        <div class="tip-item"><span class="tip-num">3</span>选一首曲子进入跟练模式，弹对每个音</div>
        <div class="tip-item"><span class="tip-num">4</span>有问题随时问AI教练哦～</div>
      </div>
    </n-card>
  </n-space>
</template>

<style scoped>
.welcome-banner {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  border-radius: 16px;
  padding: 28px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: white;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
}
.welcome-text h2 { font-size: 22px; margin-bottom: 4px; }
.welcome-text p { opacity: 0.85; font-size: 14px; }
.welcome-emoji { font-size: 56px; opacity: 0.8; }

.action-card {
  border-radius: 14px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 14px rgba(0,0,0,0.1);
  color: white;
  user-select: none;
}
.action-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}
.action-card:active { transform: scale(0.97); }
.action-label { font-size: 16px; font-weight: 600; }
.action-desc { font-size: 12px; opacity: 0.8; }

.stat-card { text-align: center; padding: 4px 0; }
.stat-icon { font-size: 28px; margin-bottom: 4px; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--primary, #6366f1); }
.stat-suffix { font-size: 14px; font-weight: 400; color: var(--text-muted); margin-left: 2px; }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }

.tips-card { border-left: 4px solid #6366f1 !important; }
.tips-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
.tips-list { display: flex; flex-direction: column; gap: 10px; }
.tip-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}
.tip-num {
  width: 24px;
  height: 24px;
  background: var(--gradient-primary, linear-gradient(135deg, #6366f1, #8b5cf6));
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .welcome-banner { padding: 20px; flex-direction: column; text-align: center; gap: 12px; }
  .welcome-emoji { font-size: 40px; }
  .welcome-text h2 { font-size: 18px; }
  .action-card { padding: 16px 12px; }
  .stat-value { font-size: 22px; }
}
</style>
