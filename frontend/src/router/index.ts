import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { title: '首页', icon: 'home' }
    },
    {
      path: '/tuner',
      name: 'tuner',
      component: () => import('../views/TunerView.vue'),
      meta: { title: '调音器', icon: 'tuner' }
    },
    {
      path: '/practice',
      name: 'practice',
      component: () => import('../views/PracticeView.vue'),
      meta: { title: '练习', icon: 'practice' }
    },
    {
      path: '/sheets',
      name: 'sheets',
      component: () => import('../views/SheetsView.vue'),
      meta: { title: '曲谱', icon: 'sheets' }
    },
    {
      path: '/progress',
      name: 'progress',
      component: () => import('../views/ProgressView.vue'),
      meta: { title: '进度', icon: 'progress' }
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('../views/ChatView.vue'),
      meta: { title: 'AI教练', icon: 'chat' }
    }
  ]
})

export default router
