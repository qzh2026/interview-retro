import { describe, expect, it } from 'vitest'
import {
  getPanelTitle,
  getQuestionPanel,
  isPanelId,
  QUESTION_PANELS,
  type PanelId,
} from '@/utils/question-panels'

const EXPECTED_IDS: PanelId[] = ['content', 'myAnswer', 'idealAnswer', 'lesson', 'review']

describe('单题复盘可放大模块配置', () => {
  it('覆盖页面 5 个模块，顺序与页面一致且 id 不重复', () => {
    expect(QUESTION_PANELS.map((panel) => panel.id)).toEqual(EXPECTED_IDS)
    expect(new Set(QUESTION_PANELS.map((panel) => panel.id)).size).toBe(QUESTION_PANELS.length)
  })

  it('标题与页面模块标题完全一致', () => {
    expect(QUESTION_PANELS.map((panel) => panel.title)).toEqual([
      '题目',
      '我当时怎么答的',
      '复盘后的正确思路',
      '踩坑点 · 下次怎么说',
      '复习打卡',
    ])
  })

  it('形态分布：题目 1 个 question、3 个文本、1 个复习打卡', () => {
    const kinds = QUESTION_PANELS.map((panel) => panel.kind)
    expect(kinds.filter((kind) => kind === 'question')).toHaveLength(1)
    expect(kinds.filter((kind) => kind === 'text')).toHaveLength(3)
    expect(kinds.filter((kind) => kind === 'review')).toHaveLength(1)
  })

  it('所有 title 非空且不含首尾空白', () => {
    for (const panel of QUESTION_PANELS) {
      expect(panel.title.trim()).toBe(panel.title)
      expect(panel.title.length).toBeGreaterThan(0)
    }
  })
})

describe('getQuestionPanel / getPanelTitle / isPanelId', () => {
  it('按 id 取到对应配置', () => {
    expect(getQuestionPanel('idealAnswer')).toEqual({
      id: 'idealAnswer',
      title: '复盘后的正确思路',
      kind: 'text',
    })
  })

  it('null 与未知 id 返回 null / 空串', () => {
    expect(getQuestionPanel(null)).toBeNull()
    expect(getQuestionPanel('extension' as PanelId)).toBeNull()
    expect(getPanelTitle(null)).toBe('')
    expect(getPanelTitle('extension' as PanelId)).toBe('')
  })

  it('getPanelTitle 与配置里的 title 一致', () => {
    for (const panel of QUESTION_PANELS) {
      expect(getPanelTitle(panel.id)).toBe(panel.title)
    }
  })

  it('isPanelId 只放行配置内的 id', () => {
    for (const panel of QUESTION_PANELS) {
      expect(isPanelId(panel.id)).toBe(true)
    }
    expect(isPanelId('')).toBe(false)
    expect(isPanelId('extension')).toBe(false)
    expect(isPanelId('Content')).toBe(false)
  })
})
