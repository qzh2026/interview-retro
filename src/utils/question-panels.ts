/**
 * 单题复盘页「可放大模块」的单一配置来源。
 *
 * 抽屉标题、点击目标与单测都从这里取 id / title，避免页面标题改动后
 * 抽屉标题漂移。配置文件保持纯数据 + 纯函数，不依赖 Vue 或 Element Plus，
 * 因此可以在 node 环境的 vitest 里直接断言。
 */

/** 可放大的模块标识，与 QuestionDetailView 的 section 一一对应 */
export type PanelId = 'content' | 'myAnswer' | 'idealAnswer' | 'lesson' | 'review'

/** 抽屉内需要渲染的控件形态 */
export type PanelKind = 'question' | 'text' | 'review'

export interface QuestionPanel {
  readonly id: PanelId
  /** 与页面模块标题完全一致 */
  readonly title: string
  readonly kind: PanelKind
}

/**
 * 顺序即页面自上而下的顺序。
 * 「扩展面板」是插件注入的第三方组件，条件渲染且尺寸/交互由插件自定，
 * 刻意不纳入放大范围。
 */
export const QUESTION_PANELS: readonly QuestionPanel[] = [
  { id: 'content', title: '题目', kind: 'question' },
  { id: 'myAnswer', title: '我当时怎么答的', kind: 'text' },
  { id: 'idealAnswer', title: '复盘后的正确思路', kind: 'text' },
  { id: 'lesson', title: '踩坑点 · 下次怎么说', kind: 'text' },
  { id: 'review', title: '复习打卡', kind: 'review' },
]

export function getQuestionPanel(id: PanelId | null): QuestionPanel | null {
  if (!id) return null
  return QUESTION_PANELS.find((panel) => panel.id === id) ?? null
}

export function isPanelId(value: string): value is PanelId {
  return QUESTION_PANELS.some((panel) => panel.id === value)
}

/** 抽屉标题；未选中模块时返回空串 */
export function getPanelTitle(id: PanelId | null): string {
  return getQuestionPanel(id)?.title ?? ''
}
