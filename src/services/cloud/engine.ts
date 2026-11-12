import { withStorageLock } from '@/services/storage-queue'
import { useInterviewStore } from '@/stores/interview'
import { useQuestionStore } from '@/stores/question'
import { useSettingsStore } from '@/stores/settings'
import { cloudApi } from './api'
import type { CloudSyncAdapter } from './adapter'
import { ApiClientError } from './http'
import { session } from './session'
import { resetSyncStatus, syncStatus } from './status'
import { clearConflictsView, setConflicts } from './conflicts'

/**
 * 同步引擎：推送待发队列 + 30s 轮询拉取 + 断网容忍。
 *
 * - 所有后端访问都经 cloudApi（页面/插件禁止裸 fetch）；
 * - pull → merge 只能走 integrateRemote，并整体包进 withStorageLock，
 *   与用户写入串行化，避免「合并结果被并发写覆盖」；
 * - 合并完成后必须 refresh 三个 store，否则 UI 还是旧快照；
 * - 网络不可用不是错误：本地照常用，状态区显示「离线」，下个周期再试。
 */

const POLL_INTERVAL_MS = 30_000
const FLUSH_DELAY_MS = 2_000

let adapter: CloudSyncAdapter | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null
let running: Promise<SyncNowResult> | null = null

export function configureCloudSync(instance: CloudSyncAdapter): void {
  adapter = instance
  adapter.onDirty(scheduleFlush)
  // 启动期把已落盘的冲突记录灌进展示态（角标才能正确显示历史未读）
  setConflicts(adapter.getConflicts())
}

export function getCloudAdapter(): CloudSyncAdapter | null {
  return adapter
}

async function refreshStores(): Promise<void> {
  await Promise.all([
    useInterviewStore().refresh(),
    useQuestionStore().refresh(),
    useSettingsStore().refresh(),
  ])
}

function notePending(): void {
  syncStatus.pendingCount = adapter?.takePending().length ?? 0
}

/** 推送待发队列（幂等变更，网络重试安全） */
async function flush(): Promise<number> {
  if (!adapter) return 0
  const pending = adapter.takePending()
  if (pending.length === 0) return 0
  const res = await cloudApi.push(pending)
  adapter.confirmPushed(pending.map((item) => item.changeId))
  notePending()
  return res.accepted
}

/** 拉取远端增量并按字段级 LWW 并入本地 */
async function pull(doRefresh: boolean): Promise<boolean> {
  if (!adapter) return false
  const res = await cloudApi.pull(adapter.getCursor())
  await withStorageLock(async () => {
    adapter!.integrateRemote(res.changes, res.cursor)
  })
  // 合并可能产出新的冲突记录，刷新展示态（角标 / 设置页列表）
  setConflicts(adapter!.getConflicts())
  if (res.changes.length > 0 && doRefresh) {
    await refreshStores()
  }
  return res.changes.length > 0
}

export interface SyncNowOptions {
  /** 合并后是否刷新 store（启动期由 initializeStores 统一灌数据，应传 false） */
  refreshStores?: boolean
}

export interface SyncNowResult {
  pushed: number
  pulled: boolean
  ok: boolean
}

/**
 * 立即同步一轮：先推后拉。
 * 可重入保护：并发调用共享同一轮，不叠加网络请求。
 */
export function syncNow(options: SyncNowOptions = {}): Promise<SyncNowResult> {
  if (!adapter || !session.isAuthenticated) {
    return Promise.resolve({ pushed: 0, pulled: false, ok: false })
  }
  running ??= runSync(options).finally(() => {
    running = null
  }) as Promise<SyncNowResult>
  return running
}

async function runSync(options: SyncNowOptions): Promise<SyncNowResult> {
  const doRefresh = options.refreshStores !== false
  syncStatus.phase = 'syncing'
  let pushed = 0
  let pulled = false
  let failed: unknown = null

  try {
    pushed = await flush()
  } catch (err) {
    failed = err
  }
  try {
    pulled = await pull(doRefresh)
  } catch (err) {
    failed = failed ?? err
  }

  if (failed) {
    const offline = failed instanceof ApiClientError && failed.code === 'NETWORK'
    syncStatus.phase = offline ? 'offline' : 'error'
    syncStatus.message = offline
      ? '网络不可用，数据已保存在本机，恢复后自动同步'
      : `同步失败：${failed instanceof Error ? failed.message : '未知错误'}`
  } else {
    syncStatus.phase = 'idle'
    syncStatus.message = pushed > 0 || pulled ? '已与云端同步' : '数据已是最新'
    syncStatus.lastSyncAt = new Date().toISOString()
  }
  notePending()
  return { pushed, pulled, ok: !failed }
}

/** 本地写入后的防抖推送调度 */
export function scheduleFlush(): void {
  if (!adapter || !session.isAuthenticated) return
  notePending()
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void syncNow()
  }, FLUSH_DELAY_MS)
}

/** 启动 30s 轮询（重复调用幂等） */
export function startPolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (session.isAuthenticated) void syncNow()
  }, POLL_INTERVAL_MS)
}

export function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/** 登录成功后：重建变更基线并立即同步一轮 */
export async function handleLogin(userId: string): Promise<void> {
  adapter?.beginAccount(userId)
  syncStatus.message = '正在与云端同步…'
  await syncNow()
}

/** 登出：停止推送，本地继续可用 */
export function handleLogout(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  resetSyncStatus()
  clearConflictsView()
}
