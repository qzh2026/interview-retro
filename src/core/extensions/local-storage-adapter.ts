import type { StorageAdapter } from '@/sdk/types'
import { STORAGE_KEY } from '@/constants'
import { reportStorageIssue } from '@/services/storage-health'

/**
 * 默认存储适配器：只做原始字符串读写。
 * 隐私模式或容量超限时降级为内存，保证本次会话可用；
 * 降级必须通过 storage-health 上报，由 UI 显式提示用户导出备份，不能只打 console。
 */
let memoryFallback: string | null = null
let readWarned = false
let writeWarned = false

export const localStorageAdapter: StorageAdapter = {
  id: 'core:local-storage',
  label: '浏览器本地存储',

  read() {
    if (typeof window === 'undefined') return memoryFallback
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      if (!readWarned) {
        readWarned = true
        reportStorageIssue({
          kind: 'read-failed',
          message: '无法读取浏览器本地存储（可能是隐私模式或权限限制），请检查浏览器设置后再录入数据。',
        })
      }
      return memoryFallback
    }
  },

  write(raw) {
    memoryFallback = raw
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, raw)
    } catch {
      if (!writeWarned) {
        writeWarned = true
        reportStorageIssue({
          kind: 'write-failed',
          message: '本地存储写入失败（可能是容量已满或隐私模式）。当前改动仅保存在内存中，关闭页面就会丢失，请立刻导出 JSON 备份。',
        })
      }
      console.warn('[storage] 本地存储写入失败，当前数据仅在内存中')
    }
  },

  clear() {
    memoryFallback = null
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 忽略：存储不可用时内存态已清空
    }
  },
}
