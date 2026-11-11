import { definePlugin } from '@/sdk'
import ReviewLogPanel from './components/ReviewLogPanel.vue'

interface LogEntry {
  at: string
  remembered: boolean
  nextReviewAt: string | null
}

/** 示例插件 D：演示事件订阅 + 插件专属配置存储 + settingsPanel UI 插槽 */
export default definePlugin({
  manifest: {
    id: 'builtin:review-log',
    name: '复习打卡日志',
    version: '1.0.0',
    description: '订阅 review:completed，把最近 50 次打卡存到插件自己的配置里',
    contributes: ['event', 'settingsPanel'],
  },

  setup({ events, settings, registerSettingsPanel, log }) {
    events.on('review:completed', ({ remembered, nextReviewAt }) => {
      const history = settings.get<LogEntry[]>() ?? []
      history.unshift({ at: new Date().toISOString(), remembered, nextReviewAt })
      settings.set(history.slice(0, 50))
      log('打卡已记录', remembered ? '记住了' : '没记住')
    })

    registerSettingsPanel({
      id: 'review-log-panel',
      title: '最近复习打卡',
      component: ReviewLogPanel,
    })
  },

  teardown() {
    // 当前版本刷新页面生效；未来支持热卸载时可在这里 off 事件
  },
})
