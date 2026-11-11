import type { AppSettings, BackupPayload, Interview, PersistedState, Question } from '@/types'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { nowISO, todayISO } from '@/utils/date'
import { readPluginSettings, writePluginSettings } from '@/core/extensions/registry'
import { loadState, replaceState, resetState } from './storage'

/** 生成为可下载的 JSON 快照（含插件配置） */
export async function buildBackup(): Promise<BackupPayload> {
  const state = await loadState()
  return {
    app: 'interview-retro',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    interviews: state.interviews,
    questions: state.questions,
    settings: state.settings,
    pluginSettings: readPluginSettings(),
  }
}

/** 通用下载，也供插件注册的 ExportFormat 复用；纯浏览器行为，保持同步 */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // 立刻 revoke 在部分浏览器会中断下载，延后到下一个任务再释放
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadBackup(): Promise<void> {
  downloadTextFile(
    `面经复盘-${todayISO()}.json`,
    JSON.stringify(await buildBackup(), null, 2),
    'application/json;charset=utf-8',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 导入前先做结构校验，避免把脏数据写进本地存储。
 * 纯校验、无 IO，保持同步：字段级的补齐由 storage.migrate() 完成；
 * 校验失败一律抛错，调用方不会写任何数据，原有内容保持不变。
 */
export function parseBackup(text: string): PersistedState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法 JSON')
  }
  if (!isRecord(raw)) throw new Error('不是本项目的备份文件，或文件已损坏')

  const data = raw as unknown as Partial<BackupPayload>
  if (
    data.app !== 'interview-retro' ||
    !Array.isArray(data.interviews) ||
    !Array.isArray(data.questions)
  ) {
    throw new Error('不是本项目的备份文件，或文件已损坏')
  }
  if (typeof data.schemaVersion === 'number' && data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`备份来自更新的数据版本（v${data.schemaVersion}），请先升级应用再导入`)
  }

  const badRecords = [...data.interviews, ...data.questions].filter(
    (item) => !isRecord(item),
  ).length
  if (badRecords > 0) {
    throw new Error(`备份中有 ${badRecords} 条记录格式非法，已取消导入（原有数据未被修改）`)
  }

  const settings = (isRecord(data.settings) ? data.settings : {}) as unknown as AppSettings
  return {
    schemaVersion: SCHEMA_VERSION,
    interviews: data.interviews as Interview[],
    questions: data.questions as Question[],
    settings: { ...DEFAULT_SETTINGS, ...settings },
  }
}

export async function applyBackup(text: string): Promise<void> {
  await replaceState(parseBackup(text))
  // 老版本备份没有 pluginSettings，忽略即可
  try {
    const raw = JSON.parse(text) as Partial<BackupPayload>
    if (isRecord(raw.pluginSettings)) {
      writePluginSettings(raw.pluginSettings)
    }
  } catch {
    // parseBackup 已校验过，这里不会失败
  }
}

export async function clearAllData(): Promise<void> {
  await resetState()
  writePluginSettings({})
}

export async function storageEstimate(): Promise<{ count: number; kb: number }> {
  const state = await loadState()
  const bytes = new Blob([JSON.stringify(state)]).size
  return {
    count: state.interviews.length + state.questions.length,
    kb: Math.round((bytes / 1024) * 10) / 10,
  }
}
