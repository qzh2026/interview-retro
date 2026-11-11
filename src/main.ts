import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus, { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { bootstrapExtensions } from '@/core/extensions/registry'
import { plugins } from '@/plugins'
import { initializeStores } from '@/stores'
import { toUserMessage } from '@/services/cloud/http'
import './styles/main.css'

async function start(): Promise<void> {
  const app = createApp(App)

  app.use(createPinia())
  // 全量引入最省事；数据量变大后可改为 unplugin-vue-components 按需引入
  app.use(ElementPlus, { locale: zhCn })

  // 双层错误兜底（第二层）：视图 try/catch 漏掉的异常统一弹提示，不静默失败
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[app] 未捕获的组件异常', info, err)
    ElMessage.error(toUserMessage(err))
  }
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[app] 未处理的 Promise 异常', event.reason)
    ElMessage.error(toUserMessage(event.reason))
  })

  // 必须在 app.use(router) 之前 await：Vue Router 安装即开始首次导航，
  // 插件路由要在这之前注册完；bootstrap 会等所有插件（含异步 setup）完成。
  await bootstrapExtensions({ plugins, router })

  // 适配器（含异步云同步插件）注册完成后再拉首屏数据；必须在首次导航之前完成
  await initializeStores()

  app.use(router)
  app.mount('#app')
}

void start().catch((err) => {
  console.error('[app] 启动失败', err)
  const root = document.getElementById('app')
  if (root) {
    root.textContent = '应用启动失败，请打开控制台查看错误，或清除站点数据后重试。'
  }
})
