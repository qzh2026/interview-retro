import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * 独立测试配置，不复用 vite.config.ts：
 * 后者带 loadEnv / server.open / manualChunks 等构建期设置，测试只需要 alias。
 *
 * 必须挂 @vitejs/plugin-vue：storage.ts → registry.ts → PluginBoundary.vue，
 * 数据层单测的 import 链会经过 .vue 文件，缺插件会在 import-analysis 阶段炸掉。
 *
 * environment 固定 node：默认 localStorageAdapter 在 `typeof window === 'undefined'`
 * 时自动降级为内存存储，因此不需要 jsdom / happy-dom。
 *
 * pool 固定 threads：默认的 forks 池会通过 IPC 代理把 SSR 转换结果写进临时目录，
 * 在受限沙箱里会抛 EPERM 并让进程以非零码退出；threads 池不落这份缓存。
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    pool: 'threads',
  },
})
