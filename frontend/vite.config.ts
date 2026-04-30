import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 把大库拆成独立 chunk——独立缓存、并行下载
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('vexflow')) return 'vendor-vexflow'
            if (id.includes('opensheetmusicdisplay')) return 'vendor-osmd'
            if (id.includes('naive-ui')) return 'vendor-naive'
            if (id.includes('@vicons')) return 'vendor-icons'
            if (id.includes('vue-router') || /[\\/]node_modules[\\/]vue[\\/]/.test(id)) return 'vendor-vue'
          }
        },
      },
    },
  },
})
