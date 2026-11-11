import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AppSettings, PersistedState } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'
import { events } from '@/core/extensions/registry'
import { applyBackup, clearAllData, downloadBackup, storageEstimate } from '@/services/backup'
import { loadState, saveState } from '@/services/storage'
import { withStorageLock } from '@/services/storage-queue'

async function currentCounts(): Promise<{ interviews: number; questions: number }> {
  const state = await loadState()
  return { interviews: state.interviews.length, questions: state.questions.length }
}

export const useSettingsStore = defineStore('settings', () => {
  // 初始值用默认设置，main.ts 的 initializeStores() 会在 mount 前 await refresh() 灌入真实数据
  const settings = ref<AppSettings>({
    ...DEFAULT_SETTINGS,
    reviewIntervals: [...DEFAULT_SETTINGS.reviewIntervals],
  })
  const usage = ref<{ count: number; kb: number }>({ count: 0, kb: 0 })

  async function refresh(): Promise<void> {
    const state = await loadState()
    settings.value = { ...state.settings }
    usage.value = await storageEstimate()
  }

  async function refreshUsage(): Promise<void> {
    usage.value = await storageEstimate()
  }

  async function update(patch: Partial<AppSettings>): Promise<void> {
    // 「读 → 改 → 写」必须在同一个锁内，否则并发保存会互相覆盖
    await withStorageLock(async () => {
      const state: PersistedState = await loadState()
      state.settings = { ...state.settings, ...patch }
      await saveState(state)
      settings.value = { ...state.settings }
    })
    await refreshUsage()
  }

  async function exportToFile(): Promise<void> {
    await downloadBackup()
    await refreshUsage()
    events.emit('data:exported', await currentCounts())
  }

  /** 整包覆盖导入；调用方负责刷新 interview / question store */
  async function importFromText(text: string): Promise<void> {
    await applyBackup(text)
    settings.value = { ...(await loadState()).settings }
    await refreshUsage()
    events.emit('data:imported', await currentCounts())
  }

  async function clearAll(): Promise<void> {
    await clearAllData()
    settings.value = { ...DEFAULT_SETTINGS }
    await refreshUsage()
    events.emit('data:cleared')
  }

  return { settings, usage, refresh, refreshUsage, update, exportToFile, importFromText, clearAll }
})
