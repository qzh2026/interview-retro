import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { InterviewInput, PersistedState } from '@/types'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import { loadState, saveState } from '@/services/storage'
import { initializeStores } from '@/stores'
import { useInterviewStore } from '@/stores/interview'
import { useQuestionStore } from '@/stores/question'
import { useSettingsStore } from '@/stores/settings'
import { makeInterview, makeQuestion } from './helpers'

/**
 * 启动流程集成测试：async 化之后 store 的 setup 不再同步读盘，
 * 首屏数据完全依赖 main.ts 在 mount 前 await initializeStores()。
 * 这里用真实 pinia + 真实存储层（不 mock service）守住这条链路。
 */
function state(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    interviews: [],
    questions: [],
    settings: { ...DEFAULT_SETTINGS },
    ...overrides,
  }
}

const interviewInput: InterviewInput = {
  company: '新公司',
  position: '前端工程师',
  round: 'tech1',
  date: '2026-11-11',
  result: 'pending',
  source: '内推',
  interviewer: '',
  overallNotes: '',
  metadata: {},
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorageAdapter.clear()
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('initializeStores 启动期预加载', () => {
  it('一次预加载后首屏即有真实数据，而不是空列表 / 默认设置', async () => {
    await saveState(state({
      interviews: [makeInterview({ id: 'i1' })],
      questions: [makeQuestion({ id: 'q1' })],
      settings: { reviewIntervals: [2, 4], dailyReviewLimit: 42 },
    }))

    await initializeStores()

    expect(useInterviewStore().items).toHaveLength(1)
    expect(useQuestionStore().items).toHaveLength(1)
    expect(useSettingsStore().settings.dailyReviewLimit).toBe(42)
    expect(useSettingsStore().usage.count).toBe(2)
  })

  it('重复预加载是幂等的，不会把数据累加', async () => {
    await saveState(state({ interviews: [makeInterview({ id: 'i1' })] }))
    await initializeStores()
    await initializeStores()
    expect(useInterviewStore().items).toHaveLength(1)
  })
})

describe('store action 端到端', () => {
  it('create 之后内存状态与持久化状态一致', async () => {
    await initializeStores()
    const created = await useInterviewStore().create(interviewInput)

    expect(created.company).toBe('新公司')
    expect(useInterviewStore().getById(created.id)?.company).toBe('新公司')
    expect((await loadState()).interviews[0].id).toBe(created.id)
  })

  it('删场次不删题：题目保留，只把 interviewId 置空', async () => {
    await saveState(state({
      interviews: [makeInterview({ id: 'i1' })],
      questions: [makeQuestion({ id: 'q1', interviewId: 'i1' })],
    }))
    await initializeStores()

    await useInterviewStore().remove('i1')

    const reloaded = await loadState()
    expect(reloaded.interviews).toHaveLength(0)
    expect(reloaded.questions).toHaveLength(1)
    expect(reloaded.questions[0].interviewId).toBeNull()
    expect(useQuestionStore().items[0].interviewId).toBeNull()
  })

  it('设置保存走串行锁，并发两次更新不会互相覆盖', async () => {
    await initializeStores()
    const settingsStore = useSettingsStore()

    await Promise.all([
      settingsStore.update({ dailyReviewLimit: 11 }),
      settingsStore.update({ reviewIntervals: [9] }),
    ])

    const reloaded = (await loadState()).settings
    expect(reloaded.dailyReviewLimit).toBe(11)
    expect(reloaded.reviewIntervals).toEqual([9])
    expect(settingsStore.settings.dailyReviewLimit).toBe(11)
  })
})
