import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import { clearStorageIssue } from '@/services/storage-health'
import { loadState, replaceState } from '@/services/storage'
import {
  applyBackup,
  buildBackup,
  clearAllData,
  parseBackup,
  storageEstimate,
} from '@/services/backup'
import { makeInterview, makeQuestion } from './helpers'

function validBackup(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'interview-retro',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: '2026-11-11T00:00:00.000Z',
    interviews: [],
    questions: [],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  })
}

beforeEach(() => {
  localStorageAdapter.clear()
  clearStorageIssue()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('parseBackup 结构校验（纯同步，不涉及存储 IO）', () => {
  it('合法备份解析为当前版本的 PersistedState', () => {
    const state = parseBackup(validBackup())
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(state.interviews).toEqual([])
    expect(state.questions).toEqual([])
    expect(state.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('缺少 settings 时用默认值补齐', () => {
    const raw = JSON.parse(validBackup()) as Record<string, unknown>
    delete raw.settings
    expect(parseBackup(JSON.stringify(raw)).settings).toEqual(DEFAULT_SETTINGS)
  })

  it('旧版备份没有 pluginSettings 也能解析', () => {
    const raw = JSON.parse(validBackup()) as Record<string, unknown>
    delete raw.pluginSettings
    expect(() => parseBackup(JSON.stringify(raw))).not.toThrow()
  })

  it.each([
    ['非法 JSON', 'not-json', /不是合法 JSON/],
    ['顶层是数组', '[]', /不是本项目的备份文件/],
    ['顶层是 null', 'null', /不是本项目的备份文件/],
    ['app 标识不对', validBackup({ app: 'other-app' }), /不是本项目的备份文件/],
    ['interviews 不是数组', validBackup({ interviews: {} }), /不是本项目的备份文件/],
    ['questions 不是数组', validBackup({ questions: 'x' }), /不是本项目的备份文件/],
  ])('%s 一律拒绝导入', (_label, text, message) => {
    expect(() => parseBackup(text)).toThrow(message)
  })

  it('来自更新版本的备份拒绝导入', () => {
    expect(() => parseBackup(validBackup({ schemaVersion: SCHEMA_VERSION + 1 })))
      .toThrow(/来自更新的数据版本/)
  })

  it('含 null 记录时拒绝导入，且不修改原有数据', async () => {
    await replaceState({
      schemaVersion: SCHEMA_VERSION,
      interviews: [makeInterview({ id: 'keep', company: '原有数据' })],
      questions: [],
      settings: { ...DEFAULT_SETTINGS },
    })

    expect(() => parseBackup(validBackup({ interviews: [null] }))).toThrow(/格式非法/)
    expect((await loadState()).interviews[0].company).toBe('原有数据')
  })
})

describe('applyBackup / buildBackup / clearAllData', () => {
  it('导入是整包覆盖', async () => {
    await replaceState({
      schemaVersion: SCHEMA_VERSION,
      interviews: [makeInterview({ id: 'i1' }), makeInterview({ id: 'i2' })],
      questions: [makeQuestion({ id: 'q1' })],
      settings: { ...DEFAULT_SETTINGS },
    })

    await applyBackup(validBackup({ interviews: [makeInterview({ id: 'new', company: '新公司' })] }))

    const state = await loadState()
    expect(state.interviews.map((i) => i.id)).toEqual(['new'])
    expect(state.interviews[0].company).toBe('新公司')
    expect(state.questions).toEqual([])
  })

  it('备份里的非法 settings 由 migrate 二次兜底', async () => {
    await applyBackup(validBackup({ settings: { reviewIntervals: [0, -3], dailyReviewLimit: 0 } }))
    expect((await loadState()).settings).toEqual(DEFAULT_SETTINGS)
  })

  it('buildBackup 含完整备份字段（含 pluginSettings）', async () => {
    const backup = await buildBackup()
    expect(backup.app).toBe('interview-retro')
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION)
    expect(backup.exportedAt).toBeTruthy()
    expect(backup.pluginSettings).toEqual({})
    expect(backup.interviews).toEqual([])
    expect(backup.questions).toEqual([])
  })

  it('storageEstimate 统计条数与体积，clearAllData 清空', async () => {
    await replaceState({
      schemaVersion: SCHEMA_VERSION,
      interviews: [makeInterview()],
      questions: [makeQuestion(), makeQuestion({ id: 'q2' })],
      settings: { ...DEFAULT_SETTINGS },
    })

    expect((await storageEstimate()).count).toBe(3)
    expect((await storageEstimate()).kb).toBeGreaterThan(0)

    await clearAllData()
    expect((await storageEstimate()).count).toBe(0)
  })
})
