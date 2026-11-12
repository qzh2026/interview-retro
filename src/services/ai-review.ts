import type { AiReviewResponse } from '@/sdk/types'

/**
 * AI 复盘结果 → 草稿补丁。
 *
 * 规则（务必不覆盖用户已写内容）：
 * - idealAnswer：仅当草稿为空才填入
 * - lesson：仅当草稿为空才把 suggestions 用换行拼接填入
 * - tags：在原有标签基础上合并 AI 建议标签，去重、保留原有顺序
 *
 * 纯函数，不改入参，便于单测。
 */
export interface AiDraftPatch {
  idealAnswer?: string
  lesson?: string
  tags: string[]
}

export function buildAiDraftPatch(
  res: AiReviewResponse,
  current: { idealAnswer: string; lesson: string; tags: string[] },
): AiDraftPatch {
  const patch: AiDraftPatch = { tags: [...current.tags] }

  if (res.idealAnswer && !current.idealAnswer.trim()) {
    patch.idealAnswer = res.idealAnswer
  }

  if (res.suggestions?.length && !current.lesson.trim()) {
    patch.lesson = res.suggestions.join('\n')
  }

  if (res.suggestedTags?.length) {
    const seen = new Set(patch.tags)
    for (const tag of res.suggestedTags) {
      const key = tag.trim()
      if (key && !seen.has(key)) {
        seen.add(key)
        patch.tags.push(key)
      }
    }
  }

  return patch
}

/** 结果面板的三类段落，也用于「填入草稿」按钮定位目标字段 */
export type AiResultTarget = 'idealAnswer' | 'lesson' | 'tags'

export interface AiResultSection {
  target: AiResultTarget
  title: string
  /** 逐条展示的内容：idealAnswer 为单条长文本，其余为多条短文本 */
  items: string[]
  /** 用户显式点「填入草稿」时写入的完整文本；tags 段不需要按钮，恒为空串 */
  applyText: string
}

/**
 * AI 响应 → 结果面板展示段。
 *
 * 与 buildAiDraftPatch 的区别：这里**完整保留** AI 生成的内容，不受「已有内容不覆盖」限制，
 * 用于把结果明确展示给用户，再由用户逐条决定是否采纳。空白项一律过滤，不产生空段。
 */
export function buildAiResultSections(res: AiReviewResponse): AiResultSection[] {
  const sections: AiResultSection[] = []
  const idealAnswer = (res.idealAnswer ?? '').trim()
  if (idealAnswer) {
    sections.push({
      target: 'idealAnswer',
      title: '理想回答思路',
      items: [idealAnswer],
      applyText: idealAnswer,
    })
  }
  const suggestions = (res.suggestions ?? []).map((item) => item.trim()).filter(Boolean)
  if (suggestions.length > 0) {
    sections.push({
      target: 'lesson',
      title: '改进建议',
      items: suggestions,
      applyText: suggestions.join('\n'),
    })
  }
  const tags = (res.suggestedTags ?? []).map((item) => item.trim()).filter(Boolean)
  if (tags.length > 0) {
    sections.push({
      target: 'tags',
      title: '建议标签',
      items: tags,
      applyText: '',
    })
  }
  return sections
}
