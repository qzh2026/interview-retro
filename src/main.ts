import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { bootstrapExtensions } from '@/core/extensions/registry'
import { plugins } from '@/plugins'
import './styles/main.css'

async function start(): Promise<void> {
  const app = createApp(App)

  app.use(createPinia())
  // 全量引入最省事；数据量变大后可改为 unplugin-vue-components 按需引入
  app.use(ElementPlus, { locale: zhCn })

  // 最后兜底：插件 UI 插槽由 PluginBoundary 隔离，这里只记录漏网异常，避免整页白屏
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[app] 未捕获的组件异常', info, err)
  }

  // 必须在 app.use(router) 之前 await：Vue Router 安装即开始首次导航，
  // 插件路由要在这之前注册完；bootstrap 会等所有插件（含异步 setup）完成。
  await bootstrapExtensions({ plugins, router })

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
