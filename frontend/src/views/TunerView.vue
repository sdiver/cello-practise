<script setup lang="ts">
import { NCard, NSpace, NButton, NText, NGrid, NGi, NSlider, NInputNumber, NTag } from 'naive-ui'
import { useTuner, playReferenceNote } from '../composables/useTuner'
import { useMetronome } from '../composables/useMetronome'
import { ref } from 'vue'

const tuner = useTuner()
const metronome = useMetronome()
const activeString = ref('')

const celloStrings = [
  { name: 'A', freq: 220, color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #f97316)' },
  { name: 'D', freq: 146.83, color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #eab308)' },
  { name: 'G', freq: 98, color: '#22c55e', gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
  { name: 'C', freq: 65.41, color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
]

function handlePlayString(s: typeof celloStrings[0]) {
  activeString.value = s.name
  playReferenceNote(s.freq)
  setTimeout(() => { activeString.value = '' }, 2000)
}

const statusConfig: Record<string, { text: string; color: string }> = {
  idle: { text: '等待启动...', color: '#94a3b8' },
  'in-tune': { text: '✓ 音准正确', color: '#22c55e' },
  flat: { text: '↓ 音偏低', color: '#ef4444' },
  sharp: { text: '↑ 音偏高', color: '#f59e0b' },
}
</script>

<template>
  <n-space vertical :size="20">
    <!-- 调音器 -->
    <n-card>
      <div class="section-header">
        <span class="section-icon">🎵</span>
        <span class="section-title">调音器</span>
      </div>

      <div class="tuner-display">
        <!-- 音符圆盘 -->
        <div
          class="note-circle"
          :class="tuner.status.value"
          :style="{ borderColor: statusConfig[tuner.status.value]?.color }"
        >
          <span class="note-main">{{ tuner.currentNote.value }}</span>
          <span v-if="tuner.currentNote.value !== '--'" class="note-oct">{{ tuner.currentOctave.value }}</span>
        </div>

        <!-- 频率和偏差 -->
        <div class="tuner-info">
          <span class="freq-text" v-if="tuner.currentFreq.value > 0">{{ tuner.currentFreq.value }} Hz</span>
          <span
            class="status-text"
            :style="{ color: statusConfig[tuner.status.value]?.color }"
          >
            {{ statusConfig[tuner.status.value]?.text }}
          </span>
        </div>

        <!-- 偏差指示条 -->
        <div class="cents-bar">
          <div class="cents-track">
            <div class="cents-label left">-50</div>
            <div class="cents-center-mark" />
            <div class="cents-label right">+50</div>
            <div
              class="cents-dot"
              :style="{
                left: `${50 + Math.max(-50, Math.min(50, tuner.currentCents.value))}%`,
                background: statusConfig[tuner.status.value]?.color || '#94a3b8'
              }"
            />
          </div>
          <div class="cents-value">
            {{ tuner.currentCents.value > 0 ? '+' : '' }}{{ tuner.currentCents.value }} 音分
          </div>
        </div>

        <n-button
          :type="tuner.isRunning.value ? 'error' : 'primary'"
          size="large" round
          :class="{ 'btn-gradient': !tuner.isRunning.value }"
          style="min-width: 160px; margin-top: 12px"
          @click="tuner.toggle"
        >
          {{ tuner.isRunning.value ? '⏹️ 停止调音' : '🎤 开始调音' }}
        </n-button>
      </div>
    </n-card>

    <!-- 参考音 -->
    <n-card>
      <div class="section-header">
        <span class="section-icon">🎻</span>
        <span class="section-title">参考音</span>
      </div>

      <n-grid :cols="4" :x-gap="12" responsive="screen" cols-s="2">
        <n-gi v-for="s in celloStrings" :key="s.name">
          <div
            class="string-btn"
            :class="{ active: activeString === s.name }"
            :style="{ '--str-gradient': s.gradient, '--str-color': s.color }"
            @click="handlePlayString(s)"
          >
            <span class="string-name">{{ s.name }}</span>
            <span class="string-freq">{{ s.freq }} Hz</span>
          </div>
        </n-gi>
      </n-grid>
    </n-card>

    <!-- 节拍器 -->
    <n-card>
      <div class="section-header">
        <span class="section-icon">🥁</span>
        <span class="section-title">节拍器</span>
      </div>

      <div class="metro-controls">
        <div class="metro-row">
          <span class="metro-label">BPM</span>
          <n-slider v-model:value="metronome.bpm.value" :min="40" :max="200" :step="1" style="flex:1" />
          <n-input-number v-model:value="metronome.bpm.value" :min="40" :max="200" size="small" style="width:72px" />
        </div>

        <div class="metro-row">
          <span class="metro-label">拍号</span>
          <n-input-number v-model:value="metronome.beatsPerMeasure.value" :min="2" :max="8" size="small" style="width:72px" />
          <span class="metro-label" style="margin-left:8px">/4</span>
        </div>

        <div class="metro-row">
          <n-button
            :type="metronome.isPlaying.value ? 'error' : 'primary'"
            round
            :class="{ 'btn-gradient': !metronome.isPlaying.value }"
            @click="metronome.toggle"
          >
            {{ metronome.isPlaying.value ? '⏹️ 停止' : '▶️ 开始' }}
          </n-button>

          <div v-if="metronome.isPlaying.value" class="beat-dots">
            <div
              v-for="i in metronome.beatsPerMeasure.value"
              :key="i"
              class="beat-dot"
              :class="{
                active: i === metronome.currentBeat.value,
                accent: i === 1 && i === metronome.currentBeat.value
              }"
            />
          </div>
        </div>
      </div>
    </n-card>
  </n-space>
</template>

<style scoped>
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.section-icon { font-size: 22px; }
.section-title { font-size: 17px; font-weight: 600; }

/* 调音器 */
.tuner-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
}

.note-circle {
  width: 140px;
  height: 140px;
  border: 5px solid #e2e8f0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: border-color 0.3s, box-shadow 0.3s;
  background: white;
}
.note-circle.in-tune {
  box-shadow: 0 0 24px rgba(34, 197, 94, 0.25);
}
.note-circle.active {
  box-shadow: 0 0 24px rgba(99, 102, 241, 0.25);
}
.note-main { font-size: 52px; font-weight: 800; color: #1e293b; }
.note-oct { font-size: 18px; color: #94a3b8; position: absolute; bottom: 28px; right: 32px; }

.tuner-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
}
.freq-text { font-size: 16px; color: #64748b; font-variant-numeric: tabular-nums; }
.status-text { font-size: 14px; font-weight: 600; transition: color 0.2s; }

.cents-bar { width: 280px; margin-top: 16px; }
.cents-track {
  position: relative;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
}
.cents-center-mark {
  position: absolute;
  left: 50%;
  top: -3px;
  width: 2px;
  height: 14px;
  background: #475569;
  transform: translateX(-50%);
}
.cents-dot {
  position: absolute;
  top: -5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  transform: translateX(-50%);
  transition: left 0.1s ease, background 0.2s;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.cents-label { position: absolute; top: 12px; font-size: 10px; color: #94a3b8; }
.cents-label.left { left: 0; }
.cents-label.right { right: 0; }
.cents-value { text-align: center; font-size: 12px; color: #64748b; margin-top: 14px; font-variant-numeric: tabular-nums; }

/* 参考音弦按钮 */
.string-btn {
  height: 80px;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid #e2e8f0;
  background: white;
  user-select: none;
}
.string-btn:hover {
  border-color: var(--str-color);
  background: #fafbff;
}
.string-btn.active {
  background: var(--str-gradient);
  border-color: transparent;
  color: white;
  box-shadow: 0 4px 14px rgba(0,0,0,0.15);
  transform: scale(1.03);
}
.string-btn.active .string-name,
.string-btn.active .string-freq { color: white; }
.string-name { font-size: 24px; font-weight: 700; color: #1e293b; transition: color 0.2s; }
.string-freq { font-size: 12px; color: #94a3b8; transition: color 0.2s; }

/* 节拍器 */
.metro-controls { display: flex; flex-direction: column; gap: 14px; }
.metro-row { display: flex; align-items: center; gap: 12px; }
.metro-label { font-size: 14px; color: #64748b; font-weight: 500; min-width: 36px; }

.beat-dots { display: flex; gap: 8px; margin-left: 12px; }
.beat-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e2e8f0;
  transition: all 0.1s;
}
.beat-dot.active {
  background: #6366f1;
  transform: scale(1.3);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}
.beat-dot.accent {
  background: #ef4444;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);
}

@media (max-width: 768px) {
  .note-circle { width: 120px; height: 120px; }
  .note-main { font-size: 42px; }
  .cents-bar { width: 220px; }
  .string-btn { height: 68px; }
  .string-name { font-size: 20px; }
}
</style>
