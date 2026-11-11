import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Question, QuestionInput } from '@/types'
import { CATEGORY_OPTIONS } from '@/constants'
import { events, getReviewStrategy } from '@/core/extensions/registry'
import { createRepository } from '@/services/repository'
import { loadState } from '@/services/storage'
import { newId } from '@/utils/id'
import { nowISO, todayISO } from '@/utils/date'
import { initialReviewPlan, pickDueQuestions } from '@/utils/review'

const repo = createRepository('questions')

export const useQuestionStore = defineStore('questions', () => {
  const items = ref<Question[]>([])

  function refresh(): void {
    items.value = repo.all()
  }
  refresh()

  const total = computed(() => items.value.length)
  const unknownCount = computed(
    () => items.value.filter((q) => q.mastery === 'unknown').length,
  )
  const dueCount = computed(
    () => items.value.filter((q) => q.mastery !== 'mastered' && (q.nextReviewAt ?? '') <= todayISO()).length,
  )

  /** 分类分布，给总览页画图用 */
  const categoryDistribution = computed(() =>
    CATEGORY_OPTIONS.map((option) => ({
      label: option.label,
      value: items.value.filter((q) => q.category === option.value).length,
    })).filter((item) => item.value > 0),
  )

  /** 低分题 = 最该优先复盘的题 */
  const weakQuestions = computed(() =>
    [...items.value]
      .filter((q) => q.selfRating <= 2 && q.mastery !== 'mastered')
      .sort((a, b) => a.selfRating - b.selfRating)
      .slice(0, 5),
  )

  function getById(id: string): Question | null {
    return items.value.find((item) => item.id === id) ?? null
  }

  function byInterview(interviewId: string): Question[] {
    return items.value.filter((q) => q.interviewId === interviewId)
  }

  function dueQuestions(limit: number): Question[] {
    return pickDueQuestions(items.value, limit)
  }

  function create(input: QuestionInput): Question {
    const ts = nowISO()
    const item: Question = {
      ...input,
      ...initialReviewPlan(loadState().settings.reviewIntervals),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    }
    repo.insert(item)
    refresh()
    events.emit('question:created', item)
    return item
  }

  /** 批量导入用：只读一次设置、一次写盘，逐条派发事件 */
  function createMany(inputs: QuestionInput[]): Question[] {
    if (inputs.length === 0) return []
    const ts = nowISO()
    const plan = initialReviewPlan(loadState().settings.reviewIntervals)
    const created: Question[] = inputs.map((input) => ({
      ...input,
      ...plan,
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    }))
    repo.insertMany(created)
    refresh()
    created.forEach((item) => events.emit('question:created', item))
    return created
  }

  function update(id: string, patch: Partial<Question>): void {
    const next = repo.update(id, patch)
    refresh()
    if (next) events.emit('question:updated', next)
  }

  function remove(id: string): void {
    repo.remove(id)
    refresh()
    events.emit('question:deleted', { id })
  }

  /** 复习打卡：间隔与掌握判定都委托给可替换的 ReviewStrategy */
  function markReviewed(id: string, remembered: boolean): void {
    const question = getById(id)
    if (!question) return
    const settings = loadState().settings
    const plan = getReviewStrategy().computeNext(question, remembered, settings)

    const patch: Partial<Question> = { ...plan }
    // 策略返回 mastery 时完全以策略为准；未返回则沿用核心默认规则（兼容旧插件）
    if (plan.mastery === undefined && remembered && question.reviewCount + 1 >= 3) {
      patch.mastery = 'mastered'
    }

    const next = repo.update(id, patch)
    refresh()
    events.emit('review:completed', {
      questionId: id,
      remembered,
      nextReviewAt: next?.nextReviewAt ?? getById(id)?.nextReviewAt ?? null,
    })
  }

  return {
    items,
    total,
    unknownCount,
    dueCount,
    categoryDistribution,
    weakQuestions,
    refresh,
    getById,
    byInterview,
    dueQuestions,
    create,
    createMany,
    update,
    remove,
    markReviewed,
  }
})
