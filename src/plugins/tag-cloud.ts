import { definePlugin } from '@/sdk'
import TagCloudWidget from './components/TagCloudWidget.vue'
import TagCloudPage from './components/TagCloudPage.vue'

/** 示例插件 C：一次性演示 dashboardWidget / menuItem / route 三个 UI 扩展点 */
export default definePlugin({
  manifest: {
    id: 'builtin:tag-cloud',
    name: '高频知识点',
    version: '1.0.0',
    description: '统计标签频次，并在总览、侧边栏与独立页面三处挂载 UI',
    contributes: ['dashboardWidget', 'menuItem', 'route'],
  },

  setup({ registerDashboardWidget, registerMenuItem, registerRoute, log }) {
    registerDashboardWidget({
      id: 'tag-cloud-widget',
      title: '高频知识点 Top 8',
      component: TagCloudWidget,
    })
    registerMenuItem({
      id: 'tag-cloud-menu',
      label: '高频标签',
      path: '/tag-cloud',
    })
    registerRoute({
      path: '/tag-cloud',
      name: 'plugin-tag-cloud',
      title: '高频标签',
      component: TagCloudPage,
    })
    log('总览卡片、菜单项与独立页面已注册')
  },
})
