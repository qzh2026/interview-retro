import type { ReviewStrategy } from '@/sdk/types'
import { nextReviewPlan } from '@/utils/review'

/** 默认复习策略：固定间隔阶梯，可被插件通过 useReviewStrategy 整体替换 */
export const intervalReviewStrategy: ReviewStrategy = {
  id: 'core:interval',
  label: '固定间隔阶梯',
  computeNext(question, remembered, settings) {
    return nextReviewPlan(question, remembered, settings.reviewIntervals)
  },
}
