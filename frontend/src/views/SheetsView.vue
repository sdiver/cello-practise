<script setup lang="ts">
import {
  NCard, NSpace, NInput, NButton, NGrid, NGi, NTag, NEmpty,
  NSelect, NText, NIcon, NSpin, NModal, NUpload, NForm, NFormItem,
  NTabs, NTabPane, useMessage
} from 'naive-ui'
import type { UploadFileInfo, UploadInst } from 'naive-ui'
import { ref, onMounted, computed } from 'vue'
import { SearchOutline } from '@vicons/ionicons5'
import { api } from '../api'

const message = useMessage()
const searchQuery = ref('')
const selectedSource = ref('all')
const sheets = ref<any[]>([])
const favorites = ref<any[]>([])
const loading = ref(false)
const activeTab = ref('search')

// 上传相关
const showUpload = ref(false)
const uploading = ref(false)
const uploadForm = ref({ title: '', composer: '', difficulty: 'beginner' })
const uploadFileList = ref<UploadFileInfo[]>([])
const uploadInstRef = ref<UploadInst | null>(null)

// 上传字段：标题留空则后端用文件名兜底
const uploadData = computed(() => ({
  title: uploadForm.value.title || '',
  composer: uploadForm.value.composer || '',
  difficulty: uploadForm.value.difficulty || 'beginner',
  user_id: '1'
}))

function handleFileChange(options: { fileList: UploadFileInfo[] }) {
  uploadFileList.value = options.fileList
  // 若标题为空，自动用文件名（去扩展名）填入
  const file = options.fileList[0]
  if (file && !uploadForm.value.title) {
    const name = file.name || ''
    uploadForm.value.title = name.replace(/\.[^.]+$/, '')
  }
}

function handleUploadFinish({ event }: { event?: ProgressEvent }) {
  uploading.value = false
  const xhr = event?.target as XMLHttpRequest | undefined
  let resp: any = {}
  try { resp = JSON.parse(xhr?.responseText || '{}') } catch {}

  if (xhr && xhr.status >= 200 && xhr.status < 300) {
    message.success(`上传成功：${resp.title || '已入库'}`)
    showUpload.value = false
    resetUploadForm()
    loadLocalSheets()
  } else {
    message.error(resp.error || '上传失败')
  }
}

function handleUploadError() {
  uploading.value = false
  message.error('上传失败，请检查网络或文件大小（≤50MB）')
}

function resetUploadForm() {
  uploadForm.value = { title: '', composer: '', difficulty: 'beginner' }
  uploadFileList.value = []
}

function triggerUpload() {
  if (!uploadFileList.value.length) {
    message.warning('请先选择文件')
    return
  }
  uploading.value = true
  uploadInstRef.value?.submit()
}

const sourceOptions = [
  { label: '全部', value: 'all' },
  { label: '本地', value: 'local' },
  { label: 'IMSLP', value: 'imslp' },
  { label: 'B站', value: 'bilibili' },
]

const difficultyOptions = [
  { label: '初级', value: 'beginner' },
  { label: '中级', value: 'intermediate' },
  { label: '高级', value: 'advanced' },
]

const difficultyMap: Record<string, { label: string; type: any }> = {
  beginner: { label: '初级', type: 'success' },
  intermediate: { label: '中级', type: 'warning' },
  advanced: { label: '高级', type: 'error' },
}

async function handleSearch() {
  if (!searchQuery.value.trim()) return
  loading.value = true
  try {
    const result = await api.searchSheets(searchQuery.value, selectedSource.value)
    sheets.value = result.data || []
  } catch (e) {
    message.error('搜索失败')
  } finally {
    loading.value = false
  }
}

async function loadLocalSheets() {
  try {
    const result = await api.getSheets({ page: 1, limit: 50 })
    sheets.value = result.data || []
  } catch (e) {
    // ignore
  }
}

async function loadFavorites() {
  try {
    favorites.value = await api.getFavorites(1)
  } catch (e) {
    // ignore
  }
}

async function toggleFavorite(sheet: any) {
  const isFav = favorites.value.some(f => f.id === sheet.id)
  try {
    if (isFav) {
      await api.removeFavorite(sheet.id, 1)
      favorites.value = favorites.value.filter(f => f.id !== sheet.id)
      message.success('取消收藏')
    } else {
      await api.addFavorite(sheet.id, 1)
      favorites.value.push(sheet)
      message.success('已收藏')
    }
  } catch (e) {
    message.error('操作失败')
  }
}

async function handleDeleteSheet(sheet: any) {
  if (!confirm(`确定删除曲谱「${sheet.title}」？此操作不可恢复。`)) return
  try {
    await api.deleteSheet(sheet.id)
    sheets.value = sheets.value.filter(s => s.id !== sheet.id)
    favorites.value = favorites.value.filter(s => s.id !== sheet.id)
    message.success('已删除')
  } catch (e) {
    message.error('删除失败')
  }
}

async function handleSaveSheet(sheet: any) {
  try {
    await api.saveSheet({
      title: sheet.title,
      composer: sheet.composer,
      difficulty: sheet.difficulty,
      source: sheet.source,
      source_url: sheet.source_url,
      metadata: sheet.metadata,
      user_id: 1
    })
    message.success('已保存到本地')
  } catch (e) {
    message.error('保存失败')
  }
}

function isFavorite(id: number) {
  return favorites.value.some(f => f.id === id)
}

onMounted(() => {
  loadLocalSheets()
  loadFavorites()
})
</script>

<template>
  <n-space vertical :size="20">
    <n-card>
      <n-tabs v-model:value="activeTab" type="line">
        <n-tab-pane name="search" tab="🔍 搜索曲谱">
          <n-space :size="12" style="margin-bottom: 16px">
            <n-input
              v-model:value="searchQuery"
              placeholder="搜索曲谱名称或作曲家..."
              clearable
              style="width: 300px"
              @keyup.enter="handleSearch"
            >
              <template #prefix>
                <n-icon><SearchOutline /></n-icon>
              </template>
            </n-input>
            <n-select v-model:value="selectedSource" :options="sourceOptions" style="width: 100px" />
            <n-button type="primary" @click="handleSearch" :loading="loading">搜索</n-button>
            <n-button @click="showUpload = true">📤 上传</n-button>
          </n-space>
        </n-tab-pane>
        <n-tab-pane name="favorites" tab="❤️ 我的收藏">
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <n-spin :show="loading">
      <template v-if="activeTab === 'search'">
        <n-grid :cols="3" :x-gap="16" :y-gap="16" v-if="sheets.length">
          <n-gi v-for="sheet in sheets" :key="sheet.id">
            <n-card hoverable size="small">
              <n-space vertical :size="8">
                <n-text strong style="font-size: 15px">{{ sheet.title }}</n-text>
                <n-text depth="3" style="font-size: 13px">{{ sheet.composer || '未知作者' }}</n-text>
                <n-space :size="6">
                  <n-tag
                    :type="difficultyMap[sheet.difficulty]?.type || 'default'"
                    size="small"
                  >
                    {{ difficultyMap[sheet.difficulty]?.label || sheet.difficulty || '未分级' }}
                  </n-tag>
                  <n-tag size="small" round>{{ sheet.source || '本地' }}</n-tag>
                </n-space>
                <n-space :size="8" style="margin-top: 4px">
                  <n-button
                    size="tiny"
                    :type="isFavorite(sheet.id) ? 'error' : 'default'"
                    @click="toggleFavorite(sheet)"
                  >
                    {{ isFavorite(sheet.id) ? '❤️' : '🤍' }}
                  </n-button>
                  <n-button
                    v-if="sheet.source_type && sheet.source_type !== 'local'"
                    size="tiny"
                    @click="handleSaveSheet(sheet)"
                  >
                    💾 保存
                  </n-button>
                  <n-button
                    size="tiny"
                    type="error"
                    ghost
                    @click="handleDeleteSheet(sheet)"
                  >
                    🗑️ 删除
                  </n-button>
                </n-space>
              </n-space>
            </n-card>
          </n-gi>
        </n-grid>
        <n-empty v-else description="搜索大提琴曲谱，如「巴赫」「铃木」" />
      </template>

      <template v-else>
        <n-grid :cols="3" :x-gap="16" :y-gap="16" v-if="favorites.length">
          <n-gi v-for="sheet in favorites" :key="sheet.id">
            <n-card hoverable size="small">
              <n-space vertical :size="8">
                <n-text strong>{{ sheet.title }}</n-text>
                <n-text depth="3">{{ sheet.composer }}</n-text>
                <n-button size="tiny" type="error" @click="toggleFavorite(sheet)">取消收藏</n-button>
              </n-space>
            </n-card>
          </n-gi>
        </n-grid>
        <n-empty v-else description="还没有收藏的曲谱" />
      </template>
    </n-spin>

    <!-- 上传对话框 -->
    <n-modal
      v-model:show="showUpload"
      title="上传曲谱"
      preset="card"
      style="width: 520px"
      :mask-closable="!uploading"
      @close="resetUploadForm"
    >
      <n-form label-placement="left" label-width="auto">
        <n-form-item label="文件">
          <n-upload
            ref="uploadInstRef"
            action="/api/sheets/upload"
            :data="uploadData"
            :default-upload="false"
            :max="1"
            :file-list="uploadFileList"
            accept=".pdf,.jpg,.jpeg,.png,.midi,.mid,.mp3,.wav,.xml,.musicxml,.mxl"
            :disabled="uploading"
            @change="handleFileChange"
            @finish="handleUploadFinish"
            @error="handleUploadError"
          >
            <n-button :disabled="uploading">选择文件</n-button>
          </n-upload>
        </n-form-item>
        <n-form-item label="曲目名称">
          <n-input
            v-model:value="uploadForm.title"
            placeholder="留空则用文件名"
            :disabled="uploading"
          />
        </n-form-item>
        <n-form-item label="作曲家">
          <n-input
            v-model:value="uploadForm.composer"
            placeholder="作曲家（可选）"
            :disabled="uploading"
          />
        </n-form-item>
        <n-form-item label="难度">
          <n-select
            v-model:value="uploadForm.difficulty"
            :options="difficultyOptions"
            :disabled="uploading"
          />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button @click="showUpload = false" :disabled="uploading">取消</n-button>
          <n-button type="primary" :loading="uploading" @click="triggerUpload">
            {{ uploading ? '上传中...' : '上传' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </n-space>
</template>
