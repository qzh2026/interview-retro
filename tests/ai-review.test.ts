import { describe, expect, it } from 'vitest'
import { buildAiDraftPatch } from '../src/services/ai-review'
import type { AiReviewResponse } from '../src/sdk/types'

describe('buildAiDraftPatch', () => {
  it('idealAnswer 仅在草稿为空时填入', () => {
    const res: AiReviewResponse = { idealAnswer: '答案', suggestedTags: [], suggestions: [] }
    expect(buildAiDraftPatch(res, { idealAnswer: '', lesson: '', tags: [] }).idealAnswer).toBe('答案')
    expect(
      buildAiDraftPatch(res, { idealAnswer: '已有', lesson: '', tags: [] }).idealAnswer,
    ).toBeUndefined()
  })

  it('lesson 仅在草稿为空时由 suggestions 拼接', () => {
    const res: AiReviewResponse = { idealAnswer: '', suggestedTags: [], suggestions: ['a', 'b'] }
    expect(buildAiDraftPatch(res, { idealAnswer: '', lesson: '', tags: [] }).lesson).toBe('a\nb')
    expect(
      buildAiDraftPatch(res, { idealAnswer: '', lesson: '已有', tags: [] }).lesson,
    ).toBeUndefined()
  })

  it('suggestedTags 合并并去重，保留原顺序', () => {
    const res: AiReviewResponse = {
      idealAnswer: '',
      suggestedTags: ['闭包', '闭包', 'JS'],
      suggestions: [],
    }
    const patch = buildAiDraftPatch(res, { idealAnswer: '', lesson: '', tags: ['JS', '函数'] })
    expect(patch.tags).toEqual(['JS', '函数', '闭包'])
  })

  it('空响应不产生任何改动（不改入参）', () => {
    const res: AiReviewResponse = { idealAnswer: '', suggestedTags: [], suggestions: [] }
    const current = { idealAnswer: 'x', lesson: 'y', tags: ['t'] }
    const patch = buildAiDraftPatch(res, current)
    expect(patch.idealAnswer).toBeUndefined()
    expect(patch.lesson).toBeUndefined()
    expect(patch.tags).toEqual(['t'])
    expect(current.tags).toEqual(['t'])
  })
})
