import type { Interview, Question } from '@/types'

/** 完整字段的测试样本，避免每个用例手拼一长串必填项 */
export function makeInterview(overrides: Partial<Interview> = {}): Interview {
  return {
    id: 'i1',
    company: '测试公司',
    position: '前端工程师',
    round: 'tech1',
    date: '2026-11-11',
    result: 'pending',
    metadata: {},
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    ...overrides,
  }
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    interviewId: null,
    content: '说说事件循环',
    category: 'tech',
    tags: [],
    difficulty: 3,
    myAnswer: '',
    idealAnswer: '',
    lesson: '',
    selfRating: 3,
    mastery: 'unknown',
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: '2026-11-11',
    metadata: {},
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    ...overrides,
  }
}
