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
