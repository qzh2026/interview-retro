import { describe, expect, it } from 'vitest'
import { buildAiDraftPatch, buildAiResultSections } from '../src/services/ai-review'
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

describe('buildAiResultSections', () => {
  it('完整结果产出三段，顺序为理想回答 / 改进建议 / 建议标签', () => {
    const res: AiReviewResponse = {
      idealAnswer: '先讲业务背景，再讲方案',
      suggestedTags: ['系统设计', 'RAG'],
      suggestions: ['补量化数据', '讲清取舍'],
    }
    const sections = buildAiResultSections(res)
    expect(sections.map((s) => s.target)).toEqual(['idealAnswer', 'lesson', 'tags'])
    expect(sections[0].items).toEqual(['先讲业务背景，再讲方案'])
    expect(sections[1].items).toEqual(['补量化数据', '讲清取舍'])
    expect(sections[2].items).toEqual(['系统设计', 'RAG'])
  })

  it('applyText：理想回答原样、建议换行拼接、标签段为空', () => {
    const res: AiReviewResponse = {
      idealAnswer: '  答案  ',
      suggestedTags: ['标签'],
      suggestions: [' a ', '', '  b  '],
    }
    const sections = buildAiResultSections(res)
    expect(sections[0].applyText).toBe('答案')
    expect(sections[1].applyText).toBe('a\nb')
    expect(sections[2].applyText).toBe('')
  })

  it('空白字段不产生空段，且不修改入参', () => {
    const res: AiReviewResponse = {
      idealAnswer: '   ',
      suggestedTags: ['', '  '],
      suggestions: [],
    }
    const snapshot = JSON.stringify(res)
    expect(buildAiResultSections(res)).toEqual([])
    expect(JSON.stringify(res)).toBe(snapshot)
  })

  it('只保留非空内容时段落数量正确', () => {
    const res: AiReviewResponse = {
      idealAnswer: '',
      suggestedTags: ['标签'],
      suggestions: ['建议'],
    }
    expect(buildAiResultSections(res).map((s) => s.target)).toEqual(['lesson', 'tags'])
  })
})
