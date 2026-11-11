import { beforeEach, describe, expect, it } from 'vitest'
import type { Interview, PersistedState, Question } from '@/types'
import type { SyncChangeInput, SyncChangeRecord } from '../shared/api'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import { createCloudSyncAdapter } from '@/services/cloud/adapter'
import { diffStates, newChangeId } from '@/services/cloud/diff'
import { applyOwnStamps, mergeChanges, type Stamps } from '@/services/cloud/merge'

function makeInterview(id: string, over: Partial<Interview> = {}): Interview {
  return {
    id,
    company: 'Acme',
    position: '前端',
    round: 'first',
    date: '2026-01-10',
    result: 'pending',
    metadata: {},
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    ...over,
  }
}

function makeQuestion(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    interviewId: null,
    content: '什么是闭包？',
    category: 'js',
    tags: [],
    difficulty: 3,
    myAnswer: '',
    idealAnswer: '',
    lesson: '',
    selfRating: 3,
    mastery: 'unknown',
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: '2026-01-11',
    metadata: {},
    createdAt: '2026-01-10T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    ...over,
  }
}

function makeState(over: Partial<PersistedState> = {}): PersistedState {
  return {
    schemaVersion: 1,
    interviews: [],
    questions: [],
    settings: { reviewIntervals: [1, 3, 7], dailyReviewLimit: 20 },
    ...over,
  }
}

function record(input: SyncChangeInput, seq = 1): SyncChangeRecord {
  return { ...input, seq }
}

describe('diffStates 状态差分', () => {
  it('新增实体产出全字段 upsert（不含 id）', () => {
    const next = makeState({ questions: [makeQuestion('q1')] })
    const changes = diffStates(null, next)

    const upsert = changes.find((c) => c.entityId === 'q1')
    expect(upsert?.op).toBe('upsert')
    expect(upsert?.fields).toHaveProperty('content')
    expect(upsert?.fields).not.toHaveProperty('id')
    expect(typeof upsert?.changeId).toBe('string')
  })

  it('修改实体只带变化字段', () => {
    const prev = makeState({ questions: [makeQuestion('q1', { content: 'A' })] })
    const next = makeState({ questions: [makeQuestion('q1', { content: 'B' })] })
    const changes = diffStates(prev, next)

    expect(changes).toHaveLength(1)
    // updatedAt 未变（真实写入会更新它），差异字段只有 content
    expect(changes[0].fields && Object.keys(changes[0].fields)).toEqual(['content'])
  })

  it('updatedAt 变化时也作为字段同步（真实仓储写入路径）', () => {
    const prev = makeState({ questions: [makeQuestion('q1')] })
    const next = makeState({
      questions: [makeQuestion('q1', { content: 'B', updatedAt: '2026-02-01T00:00:00.000Z' })],
    })
    const changes = diffStates(prev, next)
    expect(changes[0].fields && Object.keys(changes[0].fields).sort()).toEqual(['content', 'updatedAt'])
  })

  it('「删场次不删题」表现为 question.interviewId 的 upsert，不产生 delete', () => {
    const prev = makeState({
      interviews: [makeInterview('i1')],
      questions: [makeQuestion('q1', { interviewId: 'i1' })],
    })
    const next = makeState({
      interviews: [],
      questions: [makeQuestion('q1', { interviewId: null })],
    })
    const changes = diffStates(prev, next)

    const interviewChange = changes.find((c) => c.entityType === 'interview')
    expect(interviewChange?.op).toBe('delete')

    const questionChange = changes.find((c) => c.entityType === 'question')
    expect(questionChange?.op).toBe('upsert')
    expect(questionChange?.fields).toMatchObject({ interviewId: null })
    expect(changes.filter((c) => c.op === 'delete' && c.entityType === 'question')).toHaveLength(0)
  })

  it('settings 变化产出 singleton upsert', () => {
    const prev = makeState()
    const next = makeState({ settings: { reviewIntervals: [1, 3, 7], dailyReviewLimit: 50 } })
    const changes = diffStates(prev, next)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ entityType: 'settings', entityId: 'singleton', op: 'upsert' })
    expect(changes[0].fields).toEqual({ dailyReviewLimit: 50 })
  })

  it('无变化返回空数组；两次生成的 changeId 不同', () => {
    const state = makeState({ questions: [makeQuestion('q1')] })
    expect(diffStates(state, state)).toHaveLength(0)
    expect(newChangeId()).not.toBe(newChangeId())
  })
})

describe('mergeChanges 字段级 LWW', () => {
  it('新时间戳覆盖旧值，旧时间戳不回滚新值', () => {
    // 实体最后编辑于 t=200（毫秒时间戳量纲与变更一致）
    const state = makeState({
      questions: [makeQuestion('q1', { content: 'local', updatedAt: new Date(200).toISOString() })],
    })

    const older = mergeChanges(
      state,
      [record({ changeId: 'c-old', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 100, fields: { content: 'old' } })],
      {},
    )
    expect(older.state.questions[0].content).toBe('local')

    const newer = mergeChanges(
      older.state,
      [record({ changeId: 'c-new', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 500, fields: { content: 'new' } })],
      older.stamps,
    )
    expect(newer.state.questions[0].content).toBe('new')
  })

  it('无字段时间戳时用实体 updatedAt 兜底（首个登录/换设备）', () => {
    // 实体最后编辑于 t=200（毫秒 ISO）
    const state = makeState({
      questions: [makeQuestion('q1', { updatedAt: new Date(200).toISOString() })],
    })
    const stale = mergeChanges(
      state,
      [record({ changeId: 'c1', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 150, fields: { content: 'stale' } })],
      {},
    )
    expect(stale.state.questions[0].content).toBe('什么是闭包？')

    const fresh = mergeChanges(
      state,
      [record({ changeId: 'c2', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 250, fields: { content: 'fresh' } })],
      {},
    )
    expect(fresh.state.questions[0].content).toBe('fresh')
  })

  it('时间戳相同按 changeId 字典序决胜（保证多端收敛）', () => {
    const state = makeState({
      questions: [makeQuestion('q1', { updatedAt: new Date(50).toISOString() })],
    })
    const changeA = record({ changeId: 'aaa', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 100, fields: { content: 'from-A' } })
    const changeB = record({ changeId: 'bbb', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 100, fields: { content: 'from-B' } })

    const ab = mergeChanges(mergeChanges(state, [changeA], {}).state, [changeB], mergeChanges(state, [changeA], {}).stamps)
    const ba = mergeChanges(mergeChanges(state, [changeB], {}).state, [changeA], mergeChanges(state, [changeB], {}).stamps)

    expect(ab.state.questions[0].content).toBe('from-B')
    expect(ba.state.questions[0].content).toBe('from-B')
  })

  it('delete 与 upsert 按实体级时间戳决胜，较新的 upsert 复活实体', () => {
    const state = makeState({ questions: [makeQuestion('q1', { updatedAt: new Date(1000).toISOString() })] })

    // 删除时间早于实体最后更新 → 不删
    const kept = mergeChanges(
      state,
      [record({ changeId: 'd1', entityType: 'question', entityId: 'q1', op: 'delete', updatedAt: 500 })],
      {},
    )
    expect(kept.state.questions).toHaveLength(1)

    // 删除时间更新 → 删除
    const deleted = mergeChanges(
      kept.state,
      [record({ changeId: 'd2', entityType: 'question', entityId: 'q1', op: 'delete', updatedAt: 5000 })],
      kept.stamps,
    )
    expect(deleted.state.questions).toHaveLength(0)

    // 复活：更新的 upsert 回来
    const revived = mergeChanges(
      deleted.state,
      [record({ changeId: 'u1', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 6000, fields: { content: 'back' } })],
      deleted.stamps,
    )
    expect(revived.state.questions).toHaveLength(1)
    expect(revived.state.questions[0].content).toBe('back')

    // 陈旧 upsert 不能复活
    const noRevive = mergeChanges(
      deleted.state,
      [record({ changeId: 'u0', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 4000, fields: { content: 'zombie' } })],
      deleted.stamps,
    )
    expect(noRevive.state.questions).toHaveLength(0)
  })

  it('applyOwnStamps 让本地变更对回声与旧远端变更免疫', () => {
    const own: SyncChangeInput = {
      changeId: 'mine-001',
      entityType: 'question',
      entityId: 'q1',
      op: 'upsert',
      updatedAt: 300,
      fields: { content: 'mine' },
    }
    const state = makeState({ questions: [makeQuestion('q1', { content: 'mine' })] })
    const stamps = applyOwnStamps({}, [own])

    // 同一 changeId 的回声（服务器推送回来）不改变任何东西
    const echoed = mergeChanges(state, [record(own)], stamps)
    expect(echoed.state.questions[0].content).toBe('mine')

    // 更旧的远端变更也覆盖不了
    const stale = mergeChanges(
      state,
      [record({ changeId: 'other', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 200, fields: { content: 'other' } })],
      stamps,
    )
    expect(stale.state.questions[0].content).toBe('mine')
  })

  it('合并不修改入参 state 与 stamps', () => {
    const state = makeState({ questions: [makeQuestion('q1')] })
    const stamps: Stamps = { 'question:q1': { content: { t: 1, c: 'x' } } }
    const stateCopy = JSON.stringify(state)
    const stampsCopy = JSON.stringify(stamps)

    mergeChanges(
      state,
      [record({ changeId: 'c9', entityType: 'question', entityId: 'q1', op: 'upsert', updatedAt: 99, fields: { content: 'mutated' } })],
      stamps,
    )
    expect(JSON.stringify(state)).toBe(stateCopy)
    expect(JSON.stringify(stamps)).toBe(stampsCopy)
  })
})

describe('CloudSyncAdapter 待推送队列', () => {
  let adapter: ReturnType<typeof createCloudSyncAdapter>

  beforeEach(() => {
    localStorageAdapter.clear()
    adapter = createCloudSyncAdapter()
    void adapter.clear()
  })

  it('未登录时写入不产生待推送变更（纯本地模式）', async () => {
    const state = makeState({ questions: [makeQuestion('q1')] })
    await adapter.write(JSON.stringify(state))
    expect(adapter.takePending()).toHaveLength(0)
    expect(JSON.parse((await adapter.read()) ?? '{}').questions).toHaveLength(1)
  })

  it('登录时重建基线：现有数据整批成为待上传变更', async () => {
    const state = makeState({
      interviews: [makeInterview('i1')],
      questions: [makeQuestion('q1')],
    })
    await adapter.write(JSON.stringify(state))
    adapter.beginAccount('user-1')

    const pending = adapter.takePending()
    // 2 个实体 + settings singleton
    expect(pending).toHaveLength(3)
    expect(pending.some((c) => c.entityType === 'settings')).toBe(true)

    // 再次 beginAccount 同一用户：队列不动
    adapter.beginAccount('user-1')
    expect(adapter.takePending()).toHaveLength(3)

    // 换账号：队列整批重建（旧队列不泄露给新账号）
    adapter.beginAccount('user-2')
    expect(adapter.takePending()).toHaveLength(3)
  })

  it('登录后写入只记录变化字段；confirmPushed 清除已推送部分', async () => {
    const state = makeState({ questions: [makeQuestion('q1', { content: 'A' })] })
    await adapter.write(JSON.stringify(state))
    adapter.beginAccount('user-1')
    adapter.confirmPushed(adapter.takePending().map((c) => c.changeId))
    expect(adapter.takePending()).toHaveLength(0)

    const next = makeState({ questions: [makeQuestion('q1', { content: 'B' })] })
    await adapter.write(JSON.stringify(next))

    const pending = adapter.takePending()
    expect(pending).toHaveLength(1)
    expect(pending[0].fields).toMatchObject({ content: 'B' })

    adapter.confirmPushed([pending[0].changeId])
    expect(adapter.takePending()).toHaveLength(0)
  })

  it('integrateRemote 合并远端变更并推进游标，且不产生回声', async () => {
    const state = makeState({ questions: [makeQuestion('q1', { content: 'local' })] })
    await adapter.write(JSON.stringify(state))
    adapter.beginAccount('user-1')
    adapter.confirmPushed(adapter.takePending().map((c) => c.changeId))

    const remote = record(
      { changeId: 'remote-1', entityType: 'question', entityId: 'q2', op: 'upsert', updatedAt: Date.now(), fields: { content: 'from-remote' } },
      7,
    )
    adapter.integrateRemote([remote], 7)

    expect(adapter.getCursor()).toBe(7)
    const merged = JSON.parse((await adapter.read()) ?? '{}') as PersistedState
    expect(merged.questions).toHaveLength(2)
    // 合并不触发本地变更（没有回声进队列）
    expect(adapter.takePending()).toHaveLength(0)
  })
})
