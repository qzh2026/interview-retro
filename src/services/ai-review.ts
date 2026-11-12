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
