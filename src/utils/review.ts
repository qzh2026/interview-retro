import type { Question } from '@/types'
import { DEFAULT_SETTINGS } from '@/constants'
import { addDays, isDue, todayISO } from './date'

/**
 * 极简间隔重复（简化版 SM-2 / Leitner）：
 * - 记住了 → 复习阶数 +1，按 reviewIntervals 阶梯推到更远的日期
 * - 没记住 → 打回第一阶，明天再来
 * 第一版只做「够用就好」，后面要精细化可以换成完整 SM-2（加入 easiness factor）。
 */
export function nextReviewPlan(
  question: Question,
  remembered: boolean,
  intervals: number[] = DEFAULT_SETTINGS.reviewIntervals,
): Pick<Question, 'reviewCount' | 'lastReviewedAt' | 'nextReviewAt'> {
  const stage = remembered ? Math.min(question.reviewCount + 1, intervals.length) : 1
  const gap = intervals[Math.max(0, Math.min(stage - 1, intervals.length - 1))]
  const today = todayISO()

  return {
    reviewCount: remembered ? question.reviewCount + 1 : 0,
    lastReviewedAt: new Date().toISOString(),
    nextReviewAt: addDays(today, gap),
  }
}

/** 今日待复习：到期 + 未掌握优先 + 自评分低的优先 */
export function pickDueQuestions(
  questions: Question[],
  limit = DEFAULT_SETTINGS.dailyReviewLimit,
  today = todayISO(),
): Question[] {
  return questions
    .filter((q) => q.mastery !== 'mastered' && isDue(q.nextReviewAt, today))
    .sort((a, b) => {
      if (a.selfRating !== b.selfRating) return a.selfRating - b.selfRating
      return (a.nextReviewAt ?? '').localeCompare(b.nextReviewAt ?? '')
    })
    .slice(0, limit)
}

/** 新题默认明天进入第一轮复习 */
export function initialReviewPlan(intervals: number[] = DEFAULT_SETTINGS.reviewIntervals) {
  return {
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: addDays(todayISO(), intervals[0]),
  }
}
