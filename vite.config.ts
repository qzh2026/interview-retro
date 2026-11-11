import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// dev 用 Vite 本地服务；prod 是纯静态产物，可直接托管到任意静态空间
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 子路径部署（如 GitHub Pages 的 /<repo>/）必须设 VITE_BASE，否则 /assets/* 会 404。
  // Windows Git Bash 会把 /<repo>/ 自动改写成盘符路径（MSYS 路径转换），
  // 拿这种值当 base 会产出错误的资源前缀，所以做一次合法性校验再回退。
  const rawBase = env.VITE_BASE || '/'
  const base = rawBase === '/' || /^\/[^/]/.test(rawBase) ? rawBase : '/'
  if (base !== rawBase) {
    console.warn(
      `[vite] VITE_BASE="${rawBase}" 不是合法的子路径，已回退为 "/"。` +
        ' Windows Git Bash 请在命令前加 MSYS_NO_PATHCONV=1，或改用 .env.production。',
    )
  }
  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      open: true,
    },
    build: {
      outDir: 'dist',
      // dev 保留 sourcemap 便于排查；prod 关闭，避免源码随静态产物一起发布
      sourcemap: mode !== 'production',
      // Element Plus 全量引入是刻意为之：单人本地应用首屏 gzip ~350KB 可接受，
      // 换来零构建插件依赖、不用维护组件注册表。若要压到 ~100KB，
      // 可安装 unplugin-vue-components + ElementPlusResolver 改按需引入。
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          // 依赖与业务代码分包：升级依赖时业务 chunk 的缓存不会失效
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'ui-vendor': ['element-plus'],
          },
        },
      },
    },
  }
})
