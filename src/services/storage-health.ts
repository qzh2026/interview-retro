/**
 * 本地存储健康状态通道。
 *
 * 独立成模块的原因：local-storage-adapter 由 registry 引入，storage 又引入 registry，
 * 两边若直接互相 import 会形成循环依赖。这里只放一个无 Vue 依赖的极简发布订阅。
 * UI 层订阅后即可把「写入失败 / 数据损坏」这类静默故障显式提示给用户。
 */
export type StorageIssueKind = 'write-failed' | 'read-failed' | 'corrupt'

export interface StorageIssue {
  kind: StorageIssueKind
  message: string
  /** 数据损坏时保留的原始串，可下载供人工恢复 */
  raw?: string
}

let current: StorageIssue | null = null
const listeners = new Set<(issue: StorageIssue | null) => void>()

export function getStorageIssue(): StorageIssue | null {
  return current
}

export function reportStorageIssue(issue: StorageIssue): void {
  current = issue
  listeners.forEach((fn) => {
    try {
      fn(issue)
    } catch (err) {
      console.error('[storage-health] 订阅者异常', err)
    }
  })
}

export function clearStorageIssue(): void {
  current = null
  listeners.forEach((fn) => {
    try {
      fn(null)
    } catch (err) {
      console.error('[storage-health] 订阅者异常', err)
    }
  })
}

/** 订阅时会立即推送一次当前状态，返回取消订阅函数 */
export function subscribeStorageIssue(fn: (issue: StorageIssue | null) => void): () => void {
  listeners.add(fn)
  fn(current)
  return () => {
    listeners.delete(fn)
  }
}
