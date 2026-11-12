import type { AsyncStorageAdapter } from '@/sdk'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import type { PersistedState } from '@/types'
import type { SyncChangeInput, SyncChangeRecord } from '../../../shared/api'
import { diffStates } from './diff'
import { applyOwnStamps, mergeChanges, toMergeableState, type Stamps, type SyncConflict } from './merge'

/**
 * 混合云同步适配器（AsyncStorageAdapter 实现）。
 *
 * 双模式：
 * - 未登录（meta.userId 为空）：行为与 localStorageAdapter 完全一致，纯本地；
 * - 已登录：本地照常读写（离线优先），写入时顺带差分成变更记录进入待推送队列，
 *   由同步引擎批量推送到 /api/sync/push；拉取到的远端变更经 integrateRemote
 *   按字段级 LWW 并回本地。
 *
 * 并发约定（关键）：read / write / integrateRemote 的函数体**全部同步执行**
 * （localStorage 是同步 API），配合 withStorageLock 的串行队列，
 * 「读 → 改 → 写」之间不会插入其他写入。不要在这些方法里 await 任何东西。
 *
 * 自身账本（meta / pending）走独立的 localStorage key，不进 PersistedState：
 * 同步元数据不该被同步自身带走，也不该混进 JSON 备份。
 */

const META_KEY = 'interview-retro:sync-meta'
const PENDING_KEY = 'interview-retro:sync-pending'
const CONFLICTS_KEY = 'interview-retro:sync-conflicts'

/** 冲突记录最多保留条数（按检测时间倒序，旧的自然淘汰） */
const MAX_CONFLICTS = 100

interface SyncMeta {
  userId: string | null
  cursor: number
  stamps: Stamps
}

function defaultMeta(): SyncMeta {
  return { userId: null, cursor: 0, stamps: {} }
}

/* ---- 账本存储：localStorage + 内存降级（与 local-storage-adapter 同策略） ---- */

let memoryMeta: string | null = null
let memoryPending: string | null = null
let memoryConflicts: string | null = null

function readMemory(key: string): string | null {
  if (key === META_KEY) return memoryMeta
  if (key === PENDING_KEY) return memoryPending
  if (key === CONFLICTS_KEY) return memoryConflicts
  return null
}

function ledgerGet(key: string): string | null {
  if (typeof window === 'undefined') return readMemory(key)
  try {
    return window.localStorage.getItem(key)
  } catch {
    return readMemory(key)
  }
}

function ledgerSet(key: string, value: string): void {
  if (key === META_KEY) memoryMeta = value
  else if (key === PENDING_KEY) memoryPending = value
  else if (key === CONFLICTS_KEY) memoryConflicts = value
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 容量满/隐私模式：内存态仍可用，本次会话不丢
  }
}

function loadMeta(): SyncMeta {
  try {
    const parsed = JSON.parse(ledgerGet(META_KEY) ?? 'null') as Partial<SyncMeta> | null
    if (parsed && typeof parsed === 'object') {
      return {
        userId: typeof parsed.userId === 'string' ? parsed.userId : null,
        cursor: typeof parsed.cursor === 'number' ? parsed.cursor : 0,
        stamps: (parsed.stamps && typeof parsed.stamps === 'object' ? parsed.stamps : {}) as Stamps,
      }
    }
  } catch {
    // 账本损坏按首次登录处理
  }
  return defaultMeta()
}

function saveMeta(meta: SyncMeta): void {
  ledgerSet(META_KEY, JSON.stringify(meta))
}

function loadPending(): SyncChangeInput[] {
  try {
    const parsed = JSON.parse(ledgerGet(PENDING_KEY) ?? '[]') as unknown
    if (Array.isArray(parsed)) return parsed as SyncChangeInput[]
  } catch {
    // 队列损坏就当空队列：本地数据仍在，不会丢用户数据
  }
  return []
}

function savePending(pending: SyncChangeInput[]): void {
  ledgerSet(PENDING_KEY, JSON.stringify(pending))
}

/** 冲突记录读写：独立 key，绝不与 PersistedState / 同步元数据混在一起 */
function loadConflicts(): SyncConflict[] {
  try {
    const parsed = JSON.parse(ledgerGet(CONFLICTS_KEY) ?? '[]') as unknown
    if (Array.isArray(parsed)) return parsed as SyncConflict[]
  } catch {
    // 冲突账本损坏不影响同步主流程
  }
  return []
}

function saveConflicts(list: SyncConflict[]): void {
  ledgerSet(CONFLICTS_KEY, JSON.stringify(list))
}

function parseRaw(raw: string | null): PersistedState {
  if (!raw) {
    return {
      schemaVersion: SCHEMA_VERSION,
      interviews: [],
      questions: [],
      settings: { ...DEFAULT_SETTINGS, reviewIntervals: [...DEFAULT_SETTINGS.reviewIntervals] },
    }
  }
  try {
    return toMergeableState(JSON.parse(raw) as unknown)
  } catch {
    return toMergeableState(null)
  }
}

/* ---- 适配器 ---- */

export interface CloudSyncAdapter extends AsyncStorageAdapter {
  /** 登录或切换账号：换人时重建变更基线（全量上传），同账号保持队列连续 */
  beginAccount(userId: string): void
  /** 把远端变更并入本地（调用方须持有存储锁；方法体同步） */
  integrateRemote(changes: SyncChangeRecord[], cursor: number): void
  /** 待推送变更快照（引擎推送成功后调 confirmPushed） */
  takePending(): SyncChangeInput[]
  confirmPushed(changeIds: string[]): void
  getCursor(): number
  /** 读取已记录的同步冲突（不进 PersistedState） */
  getConflicts(): SyncConflict[]
  /** 移除单条冲突记录 */
  dismissConflict(id: string): void
  /** 清空全部冲突记录 */
  clearConflicts(): void
  /** 本地写入产生待推送变更时通知（引擎调度 flush） */
  onDirty(handler: () => void): void
}

export function createCloudSyncAdapter(): CloudSyncAdapter {
  let dirtyHandler: (() => void) | null = null

  return {
    id: 'core:cloud-sync',
    label: '本机存储 + 云同步',

    async read() {
      return localStorageAdapter.read()
    },

    async write(raw: string) {
      const meta = loadMeta()
      if (meta.userId) {
        const prevRaw = localStorageAdapter.read()
        const changes = diffStates(parseRaw(prevRaw), parseRaw(raw))
        if (changes.length > 0) {
          savePending([...loadPending(), ...changes])
          meta.stamps = applyOwnStamps(meta.stamps, changes)
          saveMeta(meta)
          dirtyHandler?.()
        }
      }
      localStorageAdapter.write(raw)
    },

    async clear() {
      localStorageAdapter.clear()
      saveMeta(defaultMeta())
      savePending([])
    },

    beginAccount(userId: string) {
      const meta = loadMeta()
      if (meta.userId === userId) return
      // 换账号（含首次登录）：旧队列属于上一个身份，整批重建为全量上传
      const current = parseRaw(localStorageAdapter.read())
      const changes = diffStates(null, current)
      const fresh = defaultMeta()
      fresh.userId = userId
      fresh.stamps = applyOwnStamps({}, changes)
      saveMeta(fresh)
      savePending(changes)
      if (changes.length > 0) dirtyHandler?.()
    },

    integrateRemote(changes, cursor) {
      const meta = loadMeta()
      const base = parseRaw(localStorageAdapter.read())
      const { state, stamps, conflicts } = mergeChanges(base, changes, meta.stamps)
      meta.stamps = stamps
      meta.cursor = cursor
      saveMeta(meta)
      if (changes.length > 0) {
        localStorageAdapter.write(JSON.stringify(state))
      }
      if (conflicts.length > 0) {
        // 新的在前，按 id 去重（相同 changeId 重复应用时只保留一条），裁剪到上限
        const merged = [...conflicts, ...loadConflicts()]
        const byId = new Set<string>()
        const ordered: SyncConflict[] = []
        for (const c of merged) {
          if (!byId.has(c.id)) {
            byId.add(c.id)
            ordered.push(c)
          }
        }
        saveConflicts(ordered.slice(0, MAX_CONFLICTS))
      }
    },

    takePending() {
      return loadPending()
    },

    confirmPushed(changeIds) {
      const drop = new Set(changeIds)
      savePending(loadPending().filter((item) => !drop.has(item.changeId)))
    },

    getCursor() {
      return loadMeta().cursor
    },

    getConflicts() {
      return loadConflicts()
    },

    dismissConflict(id) {
      saveConflicts(loadConflicts().filter((c) => c.id !== id))
    },

    clearConflicts() {
      saveConflicts([])
    },

    onDirty(handler) {
      dirtyHandler = handler
    },
  }
}
