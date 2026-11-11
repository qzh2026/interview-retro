import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import { clearStorageIssue, getStorageIssue } from '@/services/storage-health'
import { loadState, replaceState, resetState, saveState } from '@/services/storage'
import { makeInterview, makeQuestion } from './helpers'

/**
 * 纯 Node 环境：localStorageAdapter 在 window 不存在时走 memoryFallback，
 * 因此这里既是单元测试，也是「无浏览器时的降级路径」回归测试。
 * 存储层已统一为 async 链路，所有用例都要 await。
 */
beforeEach(() => {
  localStorageAdapter.clear()
  clearStorageIssue()
  // 损坏数据分支会主动打日志，静音以免污染测试输出
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('loadState / saveState', () => {
  it('空存储返回带默认设置的空状态', async () => {
    const state = await loadState()
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(state.interviews).toEqual([])
    expect(state.questions).toEqual([])
    expect(state.settings.reviewIntervals).toEqual(DEFAULT_SETTINGS.reviewIntervals)
    expect(state.settings.dailyReviewLimit).toBe(DEFAULT_SETTINGS.dailyReviewLimit)
  })

  it('往返读写一致，且 saveState 强制把 schemaVersion 写回当前版本', async () => {
    const state = await loadState()
    state.interviews.push(makeInterview({ company: '字节' }))
    await saveState({ ...state, schemaVersion: 999 })

    const reloaded = await loadState()
    expect(reloaded.schemaVersion).toBe(SCHEMA_VERSION)
    expect(reloaded.interviews).toHaveLength(1)
    expect(reloaded.interviews[0].company).toBe('字节')
  })
})

describe('migrate 字段兜底与脏数据自愈', () => {
  it('为残缺记录补齐默认值与时间戳', async () => {
    localStorageAdapter.write(JSON.stringify({
      schemaVersion: 0,
      interviews: [{ company: 'A' }],
      questions: [{ content: 'Q1' }],
    }))

    const state = await loadState()
    const interview = state.interviews[0]
    expect(interview.id).toBeTruthy()
    expect(interview.round).toBe('other')
    expect(interview.result).toBe('pending')
    expect(interview.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(interview.metadata).toEqual({})
    expect(interview.createdAt).toBeTruthy()
    expect(interview.updatedAt).toBeTruthy()

    const question = state.questions[0]
    expect(question.id).toBeTruthy()
    expect(question.interviewId).toBeNull()
    expect(question.category).toBe('other')
    expect(question.tags).toEqual([])
    expect(question.difficulty).toBe(3)
    expect(question.selfRating).toBe(3)
    expect(question.mastery).toBe('unknown')
    expect(question.reviewCount).toBe(0)
    expect(question.nextReviewAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(question.metadata).toEqual({})
  })

  it('过滤 null / 非对象元素，并原样透传未知字段', async () => {
    localStorageAdapter.write(JSON.stringify({
      interviews: [null, 'bad', 42, { id: 'keep', company: 'A', ownerId: 'u1', custom: 1 }],
      questions: [null, { id: 'q1' }],
    }))

    const state = await loadState()
    expect(state.interviews).toHaveLength(1)
    expect(state.questions).toHaveLength(1)
    const kept = state.interviews[0] as unknown as Record<string, unknown>
    expect(kept.id).toBe('keep')
    // 备份兼容契约：将来新增的归属字段不能被 migrate 丢掉
    expect(kept.ownerId).toBe('u1')
    expect(kept.custom).toBe(1)
  })

  it('settings 非法值回退到默认阶梯与上限', async () => {
    localStorageAdapter.write(JSON.stringify({
      settings: { reviewIntervals: [0, -1, 'x', 5, null], dailyReviewLimit: 0 },
    }))

    const settings = (await loadState()).settings
    expect(settings.reviewIntervals).toEqual([5])
    expect(settings.dailyReviewLimit).toBe(DEFAULT_SETTINGS.dailyReviewLimit)
  })

  it('JSON 损坏时不抛错、返回空状态，并上报带原始串的 corrupt 告警', async () => {
    const broken = '{ not json'
    localStorageAdapter.write(broken)

    const state = await loadState()
    expect(state.interviews).toEqual([])
    const issue = getStorageIssue()
    expect(issue?.kind).toBe('corrupt')
    expect(issue?.raw).toBe(broken)
  })
})

describe('整包覆盖与清空', () => {
  it('replaceState 覆盖旧数据，resetState 清空', async () => {
    await replaceState({
      schemaVersion: SCHEMA_VERSION,
      interviews: [makeInterview({ id: 'old' })],
      questions: [makeQuestion({ id: 'old-q' })],
      settings: { ...DEFAULT_SETTINGS },
    })
    expect((await loadState()).interviews[0].id).toBe('old')

    await replaceState({
      schemaVersion: SCHEMA_VERSION,
      interviews: [makeInterview({ id: 'new' })],
      questions: [],
      settings: { ...DEFAULT_SETTINGS },
    })
    expect((await loadState()).interviews.map((i) => i.id)).toEqual(['new'])

    await resetState()
    const state = await loadState()
    expect(state.interviews).toEqual([])
    expect(state.questions).toEqual([])
  })
})
