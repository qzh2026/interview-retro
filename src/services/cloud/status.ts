import { reactive } from 'vue'

/**
 * 云同步状态（展示用的共享响应式状态，不是 Pinia store）。
 * 引擎写、设置页读；刻意不放进 auth store，避免 engine ↔ store 循环依赖。
 */
export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error' | 'disabled'

export interface SyncStatusView {
  phase: SyncPhase
  /** 最近一次成功同步（push 或 pull 任一）的时间 */
  lastSyncAt: string | null
  /** 待推送的变更条数 */
  pendingCount: number
  message: string
}

export const syncStatus = reactive<SyncStatusView>({
  phase: 'disabled',
  lastSyncAt: null,
  pendingCount: 0,
  message: '未登录，数据仅保存在本机',
})

export function resetSyncStatus(): void {
  syncStatus.phase = 'disabled'
  syncStatus.lastSyncAt = null
  syncStatus.pendingCount = 0
  syncStatus.message = '未登录，数据仅保存在本机'
}

/**
 * 浏览器网络感知：offline 立即切离线相位，online 恢复并可触发一次同步。
 * 返回取消监听函数；非浏览器环境（测试）是 no-op。
 */
export function watchNetwork(onOnline?: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOffline = (): void => {
    if (syncStatus.phase === 'disabled') return
    syncStatus.phase = 'offline'
    syncStatus.message = '网络已断开，数据暂存本地'
  }
  const handleOnline = (): void => {
    if (syncStatus.phase !== 'offline') return
    syncStatus.phase = 'idle'
    syncStatus.message = '网络已恢复'
    onOnline?.()
  }

  window.addEventListener('offline', handleOffline)
  window.addEventListener('online', handleOnline)
  return () => {
    window.removeEventListener('offline', handleOffline)
    window.removeEventListener('online', handleOnline)
  }
}
