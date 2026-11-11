import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AppSettings, PersistedState } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'
import { events } from '@/core/extensions/registry'
import { applyBackup, clearAllData, downloadBackup, storageEstimate } from '@/services/backup'
import { loadState, saveState } from '@/services/storage'

function currentCounts(): { interviews: number; questions: number } {
  const state = loadState()
  return { interviews: state.interviews.length, questions: state.questions.length }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...loadState().settings })
  const usage = ref(storageEstimate())

  function refreshUsage(): void {
    usage.value = storageEstimate()
  }

  function update(patch: Partial<AppSettings>): void {
    const state: PersistedState = loadState()
    state.settings = { ...state.settings, ...patch }
    saveState(state)
    settings.value = { ...state.settings }
  }

  function exportToFile(): void {
    downloadBackup()
    refreshUsage()
    events.emit('data:exported', currentCounts())
  }

  /** 整包覆盖导入；调用方负责刷新 interview / question store */
  function importFromText(text: string): void {
    applyBackup(text)
    settings.value = { ...loadState().settings }
    refreshUsage()
    events.emit('data:imported', currentCounts())
  }

  function clearAll(): void {
    clearAllData()
    settings.value = { ...DEFAULT_SETTINGS }
    refreshUsage()
    events.emit('data:cleared')
  }

  return { settings, usage, refreshUsage, update, exportToFile, importFromText, clearAll }
})
