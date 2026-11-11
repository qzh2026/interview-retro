/** 稳定公共 API 单一出口：插件作者只需要 import from '@/sdk' */
export * from './types'
export { definePlugin } from './define-plugin'
export { getPluginSettings } from './settings'

/** 常用工具与常量一并暴露，避免插件依赖内部路径 */
export { todayISO, nowISO, addDays, isDue, formatDateTime } from '@/utils/date'
export { newId } from '@/utils/id'
export {
  CATEGORY_OPTIONS,
  DIFFICULTY_OPTIONS,
  MASTERY_OPTIONS,
  RATING_OPTIONS,
  RESULT_OPTIONS,
  ROUND_OPTIONS,
  DEFAULT_SETTINGS,
  labelOf,
} from '@/constants'
