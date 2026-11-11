import { definePlugin } from '@/sdk'
import { createCloudSyncAdapter } from '@/services/cloud/adapter'
import { configureCloudSync, startPolling, syncNow } from '@/services/cloud/engine'
import { tryRestoreSession } from '@/stores/auth'

/** 启动期网络操作的兜底超时：慢网络不能拖死整个应用启动 */
const BOOTSTRAP_TIMEOUT_MS = 3_000

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), BOOTSTRAP_TIMEOUT_MS)),
  ])
}

/**
 * 内置插件：云同步。
 *
 * 通过 useAsyncStorageAdapter 注入混合云适配器（本地优先 + 增量同步），
 * 页面不直接 fetch。未登录时适配器就是纯 localStorage，行为与单机版一致；
 * 登录后写入自动差分上传、30s 轮询拉取，字段级 LWW 合并。
 */
export default definePlugin({
  manifest: {
    id: 'builtin:cloud-sync',
    name: '云同步',
    version: '1.0.0',
    description: '登录后增量同步到后端；未登录时纯本机存储，离线可用',
    contributes: ['asyncStorageAdapter'],
  },

  async setup({ useAsyncStorageAdapter, log }) {
    const adapter = createCloudSyncAdapter()
    useAsyncStorageAdapter(adapter)
    configureCloudSync(adapter)

    // 静默恢复会话（HttpOnly Cookie → 访问令牌）；慢网络只等 3s，之后交给轮询
    const restored = await withTimeout(tryRestoreSession(), null)
    if (restored) {
      log('已恢复登录', restored.email)
      // 首次拉取在 initializeStores 之前完成，首屏直接看到合并后的数据
      adapter.beginAccount(restored.id)
      await withTimeout(syncNow({ refreshStores: false }), { pushed: 0, pulled: false, ok: true })
    }

    startPolling()
  },
})
