import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api'

export const useUserStore = defineStore('user', () => {
  const user = ref<any>(null)
  const settings = ref<any>({
    tuner_reference: 440,
    theme: 'dark',
    language: 'zh-CN'
  })

  const isLoggedIn = computed(() => !!user.value)
  const userId = computed(() => user.value?.id || 1)

  async function login(username: string, nickname?: string) {
    const data = await api.login(username, nickname)
    user.value = data
    localStorage.setItem('user', JSON.stringify(data))
    return data
  }

  function loadFromStorage() {
    const stored = localStorage.getItem('user')
    if (stored) {
      user.value = JSON.parse(stored)
    }
  }

  async function loadSettings() {
    if (!userId.value) return
    settings.value = await api.getUserSettings(userId.value)
  }

  return { user, settings, isLoggedIn, userId, login, loadFromStorage, loadSettings }
})
