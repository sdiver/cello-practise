<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NLayout, NLayoutHeader, NLayoutContent,
  NMenu, NIcon, NButton, NDrawer, NDrawerContent
} from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  MusicalNotesOutline, HomeOutline, MicOutline,
  DocumentTextOutline, StatsChartOutline, ChatbubblesOutline,
  MenuOutline
} from '@vicons/ionicons5'
import { h } from 'vue'

const router = useRouter()
const route = useRoute()
const activeKey = computed(() => route.name as string)
const drawerVisible = ref(false)

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions: MenuOption[] = [
  { label: '首页', key: 'home', icon: renderIcon(HomeOutline) },
  { label: '调音器', key: 'tuner', icon: renderIcon(MusicalNotesOutline) },
  { label: '练习', key: 'practice', icon: renderIcon(MicOutline) },
  { label: '曲谱', key: 'sheets', icon: renderIcon(DocumentTextOutline) },
  { label: '进度', key: 'progress', icon: renderIcon(StatsChartOutline) },
  { label: 'AI教练', key: 'chat', icon: renderIcon(ChatbubblesOutline) },
]

function handleMenuUpdate(key: string) {
  router.push({ name: key })
  drawerVisible.value = false
}
</script>

<template>
  <n-layout class="app-layout">
    <n-layout-header bordered class="app-header">
      <div class="header-content">
        <div class="header-left" @click="router.push({ name: 'home' })">
          <span class="logo-icon">🎻</span>
          <span class="app-title">AI大提琴私教</span>
        </div>

        <!-- 桌面端导航 -->
        <n-menu
          mode="horizontal"
          :value="activeKey"
          :options="menuOptions"
          @update:value="handleMenuUpdate"
          class="nav-menu hide-mobile"
        />

        <!-- 移动端菜单按钮 -->
        <n-button text class="hide-desktop" @click="drawerVisible = true">
          <n-icon :size="24"><MenuOutline /></n-icon>
        </n-button>
      </div>
    </n-layout-header>

    <n-layout-content class="app-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </n-layout-content>

    <!-- 移动端抽屉导航 -->
    <n-drawer v-model:show="drawerVisible" placement="left" :width="260">
      <n-drawer-content title="🎻 AI大提琴私教">
        <n-menu
          :value="activeKey"
          :options="menuOptions"
          @update:value="handleMenuUpdate"
        />
      </n-drawer-content>
    </n-drawer>
  </n-layout>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  background: var(--bg-page, #f8fafc);
}

.app-header {
  height: 60px;
  background: white;
  box-shadow: 0 1px 8px rgba(0,0,0,0.06);
  position: sticky;
  top: 0;
  z-index: 100;
  border-bottom: none !important;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.logo-icon {
  font-size: 30px;
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.nav-menu {
  border-bottom: none !important;
}

.app-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  width: 100%;
}

/* 页面过渡 */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .app-content {
    padding: 12px;
  }
  .app-title {
    font-size: 16px;
  }
}
</style>
