<script setup lang="ts">
import { NSpace, useMessage } from 'naive-ui'
import { ref, onMounted, nextTick } from 'vue'
import { usePractice, PRESET_SONGS } from '../composables/usePractice'
import StaffDisplay from '../components/practice/StaffDisplay.vue'
import MusicXmlDisplay from '../components/practice/MusicXmlDisplay.vue'
import MidiSheetDisplay from '../components/practice/MidiSheetDisplay.vue'
import { api } from '../api'

const message = useMessage()
const practice = usePractice()
const selectedSong = ref<number | null>(null)

// 已上传的曲谱（MIDI + MusicXML 混排）
interface ImportedSong {
  type: 'midi' | 'xml'
  name: string
  noteCount: number
  filename?: string       // MIDI 才有
  sheetId?: number | null // sheets 表 id（MIDI 通过文件名联查得到，XML 直接对应）
  notes?: any[]           // MIDI 已解析音符
  midiData?: any          // MIDI 完整解析数据（含 bpm/timeSignature 等）
  xmlContent?: string     // MusicXML 文件正文（懒加载）
}
const importedSongs = ref<ImportedSong[]>([])
const currentXml = ref<string>('')
const currentMidi = ref<any | null>(null)

function scrollToSheet() {
  nextTick(() => {
    // 优先滚到 .practice-card（含五线谱），否则 staff-wrap
    const target = document.querySelector('.practice-card') as HTMLElement | null
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
}

function handleSelectSong(idx: number) {
  selectedSong.value = idx
  currentXml.value = ''
  currentMidi.value = null
  practice.loadSong(PRESET_SONGS[idx].notes)
  scrollToSheet()
}

async function handleSelectImported(song: ImportedSong) {
  selectedSong.value = -1

  if (song.type === 'midi' && song.notes) {
    currentXml.value = ''
    currentMidi.value = song.midiData || { notes: song.notes }
    practice.loadSong(song.notes.map((n: any) => ({
      note: n.name,
      octave: n.octave
    })))
    scrollToSheet()
    return
  }

  if (song.type === 'xml' && song.sheetId) {
    try {
      // 懒加载 XML 内容
      if (!song.xmlContent) {
        song.xmlContent = await api.getMusicXmlContent(song.sheetId)
      }
      currentXml.value = song.xmlContent
      // 暂用空音符列表占位——跟弹判定后续与 OSMD cursor 集成
      practice.loadSong([])
      scrollToSheet()
    } catch (e) {
      message.error('加载曲谱失败')
    }
  }
}

async function handleDeleteImported(song: ImportedSong, e: Event) {
  e.stopPropagation()  // 阻止冒泡触发选中
  if (!song.sheetId) {
    message.warning('此文件无数据库记录，无法删除（如系旧文件，请手动清理 uploads/）')
    return
  }
  if (!confirm(`确定删除曲谱「${song.name}」吗？此操作不可恢复。`)) return

  try {
    await api.deleteSheet(song.sheetId)
    importedSongs.value = importedSongs.value.filter(s => s !== song)
    // 若正选中此曲，重置
    const selectedFile = importedSongs.value.find(
      s => s.filename === song.filename && s.sheetId === song.sheetId
    )
    if (!selectedFile) {
      currentMidi.value = null
      currentXml.value = ''
      practice.reset()
      selectedSong.value = null
    }
    message.success('已删除')
  } catch (err) {
    message.error('删除失败')
  }
}

async function loadSavedMidi() {
  // 1. 加载 MIDI（来自 /api/musescore/midi）
  try {
    const files = await api.listMidiFiles()
    for (const f of files.slice(0, 10)) {
      try {
        const data = await api.getMidiNotes(f.filename)
        importedSongs.value.push({
          type: 'midi',
          name: f.name || data.name,
          filename: f.filename,
          sheetId: f.sheetId || null,  // 后端联查 sheets 表得到
          noteCount: data.noteCount,
          notes: data.notes,
          midiData: data,
        })
      } catch {}
    }
  } catch {}

  // 2. 加载 MusicXML（来自 /api/sheets，过滤 xml_path 不为空）
  try {
    const result = await api.getSheets({ page: 1, limit: 50 })
    const xmlSheets = (result.data || []).filter((s: any) => s.xml_path)
    for (const s of xmlSheets) {
      importedSongs.value.push({
        type: 'xml',
        name: s.title,
        sheetId: s.id,
        noteCount: s.metadata ? (JSON.parse(s.metadata)?.measure_count || 0) : 0,
      })
    }
  } catch {}
}

function handleResetSong() {
  practice.reset()
  selectedSong.value = null
  currentXml.value = ''
  currentMidi.value = null
}

async function handleStart() {
  try { await practice.start() }
  catch (e: any) {
    // 显示具体错误（HTTPS 限制 / 浏览器不支持 / 用户拒绝授权）
    const msg = e?.message || '无法访问麦克风，请授权后重试'
    message.error(msg, { duration: 6000 })
  }
}

onMounted(loadSavedMidi)

const formatTime = (s: number) => {
  const min = Math.floor(s / 60)
  const sec = s % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

// 音符颜色映射——彩虹色，让每个音名有独特颜色
const noteColors: Record<string, string> = {
  'C': '#ef4444', 'D': '#f97316', 'E': '#eab308',
  'F': '#22c55e', 'G': '#06b6d4', 'A': '#3b82f6', 'B': '#8b5cf6',
  'C#': '#dc2626', 'D#': '#ea580c', 'F#': '#16a34a', 'G#': '#0891b2', 'A#': '#2563eb',
}

function getNoteColor(name: string): string {
  return noteColors[name] || '#6366f1'
}
</script>

<template>
  <n-space vertical :size="20">
    <!-- 选曲卡片 -->
    <div class="song-card">
      <div class="song-header">
        <span class="song-emoji">🎵</span>
        <span class="song-title">选一首曲子吧！</span>
      </div>

      <div class="song-list">
        <div
          v-for="(song, i) in PRESET_SONGS"
          :key="i"
          class="song-item"
          :class="{ active: selectedSong === i }"
          @click="handleSelectSong(i)"
        >
          <span class="song-icon">{{ ['🎶', '🎵', '🎸', '⭐', '🎉'][i] }}</span>
          <span class="song-name">{{ song.name.replace(/🎵 /, '') }}</span>
          <span class="song-count">{{ song.notes.length }}音</span>
        </div>
      </div>

      <!-- 已上传的曲谱 -->
      <div v-if="importedSongs.length" class="import-section">
        <div class="import-title">📂 已上传的曲谱</div>
        <div class="imported-list">
          <div
            v-for="song in importedSongs"
            :key="(song.sheetId || 0) + ':' + (song.filename || song.name)"
            class="song-item imported"
            :class="{ 'is-xml': song.type === 'xml' }"
            @click="handleSelectImported(song)"
          >
            <span class="song-icon">{{ song.type === 'xml' ? '🎼' : '📄' }}</span>
            <span class="song-name">{{ song.name }}</span>
            <span class="song-count">
              {{ song.type === 'xml' ? `${song.noteCount}小节` : `${song.noteCount}音` }}
            </span>
            <button
              v-if="song.sheetId"
              class="song-delete"
              title="删除此曲谱"
              @click="handleDeleteImported(song, $event)"
            >🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- MusicXML 谱面（OSMD 渲染，只显示大提琴轨） -->
    <div v-if="currentXml" class="practice-card">
      <div class="practice-status">
        <div class="status-left">
          <span class="status-emoji">🎼</span>
          <span class="status-title">五线谱（仅大提琴轨）</span>
        </div>
      </div>
      <MusicXmlDisplay :xml="currentXml" :cello-only="true" :show-cursor="true" />
    </div>

    <!-- 五线谱 + 音符（MIDI / 预设曲） -->
    <div v-if="practice.notes.value.length > 0 && !currentXml" class="practice-card">
      <!-- 状态栏 -->
      <div class="practice-status">
        <div class="status-left">
          <span class="status-emoji">🎼</span>
          <span class="status-title">{{ PRESET_SONGS[selectedSong!]?.name.replace(/🎵 /, '') }}</span>
        </div>
        <div class="status-right">
          <div v-if="practice.detectedNote.value" class="detected-badge">
            🎤 {{ practice.detectedNote.value }}
          </div>
          <div v-if="practice.isPlaying.value" class="time-badge">
            ⏱️ {{ formatTime(practice.elapsedTime.value) }}
          </div>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar-wrap">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{
              width: practice.progress.value + '%',
              background: practice.isCompleted.value
                ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                : 'linear-gradient(90deg, #6366f1, #a855f7)'
            }"
          />
        </div>
        <span class="progress-text">{{ practice.progress.value }}%</span>
      </div>

      <!-- 真实曲谱五线谱（从 MIDI 数据生成） -->
      <div v-if="currentMidi && currentMidi.notes && currentMidi.notes.length" class="staff-wrap">
        <MidiSheetDisplay
          :notes="currentMidi.notes"
          :bpm="currentMidi.bpm || 120"
          :time-signature="currentMidi.timeSignature || [4, 4]"
          :key-signature="currentMidi.keySignature || 'C'"
          :key-scale="currentMidi.keyScale || 'major'"
          :ppq="currentMidi.ppq || 480"
          :current-index="practice.currentIndex.value"
        />
      </div>

      <!-- 预设曲简化五线谱 -->
      <div v-else class="staff-wrap">
        <StaffDisplay
          :notes="practice.notes.value"
          :current-index="practice.currentIndex.value"
        />
      </div>

      <!-- 大音符方块 -->
      <div class="notes-grid">
        <div
          v-for="(note, i) in practice.notes.value"
          :key="i"
          class="note-block"
          :class="note.status"
          :style="{
            '--note-color': getNoteColor(note.noteName),
          }"
        >
          <span class="note-letter">{{ note.noteName }}</span>
          <span class="note-oct">{{ note.octave }}</span>

          <!-- 正确标记 -->
          <span v-if="note.status === 'correct'" class="note-star">⭐</span>

          <!-- 当前活跃指示 -->
          <div v-if="note.status === 'active'" class="active-ring" />
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="action-area">
        <button
          v-if="!practice.isPlaying.value && !practice.isCompleted.value"
          class="big-btn start-btn"
          @click="handleStart"
        >
          🎤 开始跟练！
        </button>
        <button
          v-if="practice.isPlaying.value"
          class="big-btn stop-btn"
          @click="practice.stop"
        >
          ⏹️ 暂停
        </button>
        <button class="big-btn reset-btn" @click="handleResetSong()">
          🔄 换一首
        </button>
      </div>
    </div>

    <!-- 完成画面 -->
    <div v-if="practice.isCompleted.value" class="complete-card">
      <div class="confetti">🎉🎊🌟</div>
      <div class="complete-title">太棒了！</div>
      <div class="complete-subtitle">你完成了整首曲子！</div>

      <div class="result-grid">
        <div class="result-item">
          <span class="result-icon">✅</span>
          <span class="result-num">{{ practice.correctCount.value }}</span>
          <span class="result-label">正确音符</span>
        </div>
        <div class="result-item">
          <span class="result-icon">🎯</span>
          <span class="result-num">{{ practice.accuracy.value }}%</span>
          <span class="result-label">完成率</span>
        </div>
        <div class="result-item">
          <span class="result-icon">⏱️</span>
          <span class="result-num">{{ formatTime(practice.elapsedTime.value) }}</span>
          <span class="result-label">用时</span>
        </div>
      </div>

      <div class="complete-actions">
        <button class="big-btn start-btn" @click="handleStart">🔁 再来一次</button>
        <button class="big-btn reset-btn" @click="handleResetSong()">🎵 换一首</button>
      </div>
    </div>

    <!-- 引导卡片 -->
    <div v-if="practice.notes.value.length === 0" class="guide-card">
      <div class="guide-emoji">🎻</div>
      <div class="guide-title">跟练模式</div>
      <div class="guide-desc">跟着乐谱弹，弹对亮星星！</div>
      <div class="guide-steps">
        <div class="step" v-for="(s, i) in [
          { icon: '👆', text: '选一首喜欢的曲子' },
          { icon: '🎤', text: '点击「开始跟练」' },
          { icon: '👀', text: '看蓝色方块，弹对应的音' },
          { icon: '⭐', text: '弹对了变成星星！' },
        ]" :key="i">
          <span class="step-icon">{{ s.icon }}</span>
          <span class="step-text">{{ s.text }}</span>
        </div>
      </div>
    </div>
  </n-space>
</template>

<style scoped>
/* 选曲卡片 */
.song-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.song-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.song-emoji { font-size: 28px; }
.song-title { font-size: 20px; font-weight: 700; color: #1e293b; }

.song-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.song-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 14px;
  background: #f1f5f9;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  font-size: 14px;
}
.song-item:hover { background: #e2e8f0; transform: translateY(-1px); }
.song-item.active {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: white;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.3);
  transform: scale(1.02);
}
.song-icon { font-size: 18px; }
.song-name { font-weight: 600; }
.song-count { font-size: 12px; opacity: 0.7; }

/* 练习区域 */
.practice-card {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

.practice-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.status-left { display: flex; align-items: center; gap: 8px; }
.status-emoji { font-size: 24px; }
.status-title { font-size: 18px; font-weight: 600; }
.status-right { display: flex; gap: 8px; }

.detected-badge, .time-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
}
.detected-badge { background: #eef2ff; color: #6366f1; }
.time-badge { background: #f0fdf4; color: #16a34a; }

/* 进度条 */
.progress-bar-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.progress-bar {
  flex: 1;
  height: 10px;
  background: #e2e8f0;
  border-radius: 5px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.3s ease;
}
.progress-text { font-size: 13px; font-weight: 600; color: #6366f1; min-width: 36px; }

/* 五线谱 */
.staff-wrap {
  margin: 8px 0 16px;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 8px;
  background: #fafbff;
}

/* 音符方块 */
.notes-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin: 8px 0 16px;
}

.note-block {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s;
  background: #f8fafc;
  border: 3px solid #e2e8f0;
  cursor: default;
}

.note-block.pending {
  opacity: 0.6;
}

.note-block.active {
  border-color: var(--note-color);
  background: white;
  transform: scale(1.15);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.2);
  opacity: 1;
}

.note-block.correct {
  border-color: #22c55e;
  background: #f0fdf4;
  opacity: 1;
}

.note-letter {
  font-size: 24px;
  font-weight: 800;
  color: var(--note-color, #6366f1);
  line-height: 1;
}

.note-block.correct .note-letter { color: #22c55e; }

.note-oct {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 1px;
}

.note-star {
  position: absolute;
  top: -8px;
  right: -8px;
  font-size: 20px;
  animation: star-pop 0.4s ease;
}

@keyframes star-pop {
  0% { transform: scale(0) rotate(-30deg); }
  60% { transform: scale(1.3) rotate(10deg); }
  100% { transform: scale(1) rotate(0); }
}

.active-ring {
  position: absolute;
  inset: -5px;
  border-radius: 20px;
  border: 3px solid var(--note-color);
  animation: ring-pulse 1.2s ease-in-out infinite;
}

@keyframes ring-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0; transform: scale(1.2); }
}

/* 大按钮 */
.action-area {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

.big-btn {
  padding: 14px 28px;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.big-btn:active { transform: scale(0.96); }

.start-btn {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: white;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
}
.start-btn:hover { box-shadow: 0 6px 24px rgba(99, 102, 241, 0.45); transform: translateY(-1px); }

.stop-btn {
  background: linear-gradient(135deg, #ef4444, #f97316);
  color: white;
  box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3);
}

.reset-btn {
  background: #f1f5f9;
  color: #475569;
}
.reset-btn:hover { background: #e2e8f0; }

/* 完成画面 */
.complete-card {
  background: white;
  border-radius: 20px;
  padding: 32px 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  text-align: center;
}
.confetti { font-size: 48px; margin-bottom: 8px; animation: bounce 0.6s ease; }
@keyframes bounce {
  0% { transform: scale(0); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}
.complete-title { font-size: 28px; font-weight: 800; color: #1e293b; }
.complete-subtitle { font-size: 15px; color: #64748b; margin-top: 4px; }

.result-grid {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin: 24px 0;
}
.result-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.result-icon { font-size: 28px; }
.result-num { font-size: 28px; font-weight: 800; color: #6366f1; }
.result-label { font-size: 12px; color: #94a3b8; }

.complete-actions { display: flex; justify-content: center; gap: 12px; }

/* 引导卡片 */
.guide-card {
  background: white;
  border-radius: 20px;
  padding: 32px 24px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  text-align: center;
}
.guide-emoji { font-size: 56px; margin-bottom: 8px; }
.guide-title { font-size: 24px; font-weight: 800; color: #1e293b; }
.guide-desc { font-size: 15px; color: #64748b; margin-top: 4px; margin-bottom: 20px; }
.guide-steps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 300px;
  margin: 0 auto;
  text-align: left;
}
.step {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #475569;
}
.step-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: #f1f5f9;
  border-radius: 12px;
  flex-shrink: 0;
}

/* 已上传曲谱 */
.import-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f1f5f9;
}
.import-title { font-size: 14px; font-weight: 600; color: #475569; margin-bottom: 10px; }

.imported-list { display: flex; flex-wrap: wrap; gap: 8px; }
.song-item.imported {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  position: relative;
  padding-right: 38px;
}
.song-item.imported:hover {
  background: #dcfce7;
}
.song-delete {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 6px;
  opacity: 0.4;
  transition: opacity 0.2s, background 0.2s;
}
.song-item.imported:hover .song-delete { opacity: 1; }
.song-delete:hover { background: #fee2e2; opacity: 1; }

/* 移动端 */
@media (max-width: 768px) {
  .song-card, .practice-card, .complete-card, .guide-card {
    padding: 16px;
    border-radius: 16px;
  }
  .note-block { width: 52px; height: 52px; border-radius: 12px; }
  .note-letter { font-size: 18px; }
  .notes-grid { gap: 6px; }
  .big-btn { padding: 12px 20px; font-size: 14px; border-radius: 12px; }
  .song-item { padding: 8px 12px; font-size: 13px; }
  .result-grid { gap: 16px; }
  .result-num { font-size: 22px; }
  .complete-title { font-size: 22px; }
  .staff-wrap { padding: 4px; }
}
</style>
