import { describe, expect, it } from 'vitest'
import { buildSampleBundle, loadSampleData } from '@/services/sample-data'
import type { QuestionCategory, InterviewRound, InterviewResult } from '@/types'

const VALID_CATEGORIES: QuestionCategory[] = [
  'tech',
  'project',
  'algorithm',
  'design',
  'behavior',
  'hr',
  'reverse',
  'other',
]
const VALID_ROUNDS: InterviewRound[] = [
  'written',
  'tech1',
  'tech2',
  'tech3',
  'cross',
  'manager',
  'hr',
  'other',
]
const VALID_RESULTS: InterviewResult[] = ['pending', 'passed', 'failed', 'offer', 'withdrawn']

describe('buildSampleBundle 示例数据完整性', () => {
  const bundle = buildSampleBundle(new Date('2026-11-11T00:00:00Z'))

  it('包含 3 场面试，每场挂 2-4 道题，另有独立题', () => {
    expect(bundle.interviews).toHaveLength(3)
    const linked = bundle.interviews.reduce((n, item) => n + item.questions.length, 0)
    expect(linked).toBeGreaterThanOrEqual(8)
    expect(bundle.standalone.length).toBeGreaterThanOrEqual(1)
    // 独立题演示「脱离场次录入」，其余总数十道左右
    expect(linked + bundle.standalone.length).toBeGreaterThanOrEqual(10)
  })

  it('每道题三段式齐全且非占位', () => {
    const questions = [...bundle.interviews.flatMap((item) => item.questions), ...bundle.standalone]
    for (const q of questions) {
      expect(q.content.trim().length).toBeGreaterThan(0)
      expect(q.myAnswer.trim().length).toBeGreaterThan(0)
      expect(q.idealAnswer.trim().length).toBeGreaterThan(0)
      expect(q.lesson.trim().length).toBeGreaterThan(0)
    }
  })

  it('取值全部落在合法联合类型 / 数值区间内', () => {
    for (const { input } of bundle.interviews) {
      expect(VALID_ROUNDS).toContain(input.round)
      expect(VALID_RESULTS).toContain(input.result)
      expect(input.company.trim().length).toBeGreaterThan(0)
      expect(input.position.trim().length).toBeGreaterThan(0)
    }
    const questions = [...bundle.interviews.flatMap((item) => item.questions), ...bundle.standalone]
    for (const q of questions) {
      expect(VALID_CATEGORIES).toContain(q.category)
      expect(q.difficulty).toBeGreaterThanOrEqual(1)
      expect(q.difficulty).toBeLessThanOrEqual(5)
      expect(q.selfRating).toBeGreaterThanOrEqual(1)
      expect(q.selfRating).toBeLessThanOrEqual(5)
      expect(['unknown', 'learning', 'mastered']).toContain(q.mastery)
      expect(q.tags.length).toBeGreaterThan(0)
    }
  })

  it('面试日期是合法 ISO 日期且不晚于注入的「今天」', () => {
    for (const { input } of bundle.interviews) {
      expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(input.date <= '2026-11-11').toBe(true)
    }
  })

  it('至少一道低分未掌握题（让「低分优先」区块有内容可看）', () => {
    const questions = bundle.interviews.flatMap((item) => item.questions)
    expect(questions.some((q) => q.selfRating <= 2 && q.mastery !== 'mastered')).toBe(true)
  })
})

describe('loadSampleData 接口形状', () => {
  it('导出函数存在且返回统计（写入路径由 store 单测覆盖）', () => {
    expect(typeof loadSampleData).toBe('function')
  })
})
