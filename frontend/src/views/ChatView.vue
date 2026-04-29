<script setup lang="ts">
import { NCard, NSpace, NInput, NButton, NText, NScrollbar, NTag } from 'naive-ui'
import { ref, nextTick } from 'vue'
import { api } from '../api'

interface Message {
  role: 'user' | 'ai'
  content: string
  time: string
}

const inputMessage = ref('')
const messages = ref<Message[]>([])
const loading = ref(false)
const scrollRef = ref<any>(null)

const quickQuestions = [
  '揉弦怎么练？',
  '怎么拉好长弓？',
  '第三把位怎么找？',
  '练琴时手指疼怎么办？',
  '推荐适合初学者的曲子',
]

async function sendMessage(text?: string) {
  const msg = text || inputMessage.value.trim()
  if (!msg || loading.value) return

  messages.value.push({
    role: 'user',
    content: msg,
    time: new Date().toLocaleTimeString()
  })
  inputMessage.value = ''
  loading.value = true

  await nextTick()
  scrollToBottom()

  try {
    const result = await api.chatWithAI(msg, 1)
    messages.value.push({
      role: 'ai',
      content: result.response,
      time: new Date().toLocaleTimeString()
    })
  } catch (e: any) {
    messages.value.push({
      role: 'ai',
      content: '抱歉，AI教练暂时无法回答，请稍后再试～',
      time: new Date().toLocaleTimeString()
    })
  } finally {
    loading.value = false
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  scrollRef.value?.scrollTo({ top: 99999 })
}
</script>

<template>
  <n-space vertical :size="16" style="height: calc(100vh - 140px)">
    <n-card title="🤖 AI大提琴教练" style="flex: 1; display: flex; flex-direction: column">
      <!-- 快捷问题 -->
      <n-space v-if="messages.length === 0" :size="8" style="margin-bottom: 16px" wrap>
        <n-tag
          v-for="q in quickQuestions"
          :key="q"
          checkable
          style="cursor: pointer"
          @click="sendMessage(q)"
        >
          {{ q }}
        </n-tag>
      </n-space>

      <!-- 消息列表 -->
      <n-scrollbar ref="scrollRef" style="flex: 1; max-height: calc(100vh - 320px)">
        <n-space vertical :size="12" style="padding: 8px">
          <div
            v-for="(msg, i) in messages"
            :key="i"
            :class="['message', msg.role === 'user' ? 'message-user' : 'message-ai']"
          >
            <n-text depth="3" style="font-size: 12px">
              {{ msg.role === 'user' ? '你' : '🤖 AI教练' }} · {{ msg.time }}
            </n-text>
            <div class="message-bubble">
              <n-text>{{ msg.content }}</n-text>
            </div>
          </div>
          <div v-if="loading" class="message message-ai">
            <n-text depth="3" style="font-size: 12px">🤖 AI教练正在思考...</n-text>
          </div>
        </n-space>
      </n-scrollbar>

      <!-- 输入框 -->
      <n-space :size="12" style="margin-top: 16px">
        <n-input
          v-model:value="inputMessage"
          placeholder="问问AI教练..."
          :disabled="loading"
          @keyup.enter="sendMessage()"
          style="flex: 1"
        />
        <n-button type="primary" :loading="loading" @click="sendMessage()">发送</n-button>
      </n-space>
    </n-card>
  </n-space>
</template>

<style scoped>
.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.message-user {
  align-items: flex-end;
}
.message-ai {
  align-items: flex-start;
}
.message-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.5;
}
.message-user .message-bubble {
  background: #3498db;
  color: white;
  border-bottom-right-radius: 4px;
}
.message-ai .message-bubble {
  background: #f0f2f5;
  border-bottom-left-radius: 4px;
}
</style>
