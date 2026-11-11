import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Interview, InterviewInput } from '@/types'
import { events } from '@/core/extensions/registry'
import { createRepository } from '@/services/repository'
import { newId } from '@/utils/id'
import { nowISO, todayISO } from '@/utils/date'
import { useQuestionStore } from './question'

const repo = createRepository('interviews')
const questionRepo = createRepository('questions')

export const useInterviewStore = defineStore('interviews', () => {
  const items = ref<Interview[]>([])

  /**
   * 初始加载由 main.ts 的 initializeStores() 在 mount 之前 await，
   * setup 里不再同步读盘；否则首屏会先渲染空列表再闪一下真实数据。
   */
  async function refresh(): Promise<void> {
    items.value = await repo.all()
  }

  const sorted = computed(() =>
    [...items.value].sort((a, b) => b.date.localeCompare(a.date)),
  )

  function getById(id: string): Interview | null {
    return items.value.find((item) => item.id === id) ?? null
  }

  /**
   * 模板里同步调用（表格列），不能改成 async。
   * 改读 questionStore 的响应式 items：题目增删后计数会自动更新，
   * 也省掉原来每次渲染都全量读盘。
   */
  function questionCount(id: string): number {
    return useQuestionStore().items.filter((q) => q.interviewId === id).length
  }

  async function create(input: InterviewInput): Promise<Interview> {
    const ts = nowISO()
    const item: Interview = {
      ...input,
      date: input.date || todayISO(),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    }
    await repo.insert(item)
    await refresh()
    events.emit('interview:created', item)
    return item
  }

  /** 批量导入用：一次写盘，逐条派发事件，避免 N 次全量读写 */
  async function createMany(inputs: InterviewInput[]): Promise<Interview[]> {
    if (inputs.length === 0) return []
    const ts = nowISO()
    const created: Interview[] = inputs.map((input) => ({
      ...input,
      date: input.date || todayISO(),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    }))
    await repo.insertMany(created)
    await refresh()
    created.forEach((item) => events.emit('interview:created', item))
    return created
  }

  async function update(id: string, patch: Partial<Interview>): Promise<void> {
    const next = await repo.update(id, patch)
    await refresh()
    if (next) events.emit('interview:updated', next)
  }

  async function remove(id: string): Promise<void> {
    // 删场次不删题：题目是复盘资产，只解除关联，避免误删历史记录。
    // 每步都是已加锁的独立仓储调用；顺序 await，不要在外部再套一层锁（会死锁）。
    const related = await questionRepo.all()
    for (const q of related.filter((item) => item.interviewId === id)) {
      await questionRepo.update(q.id, { interviewId: null })
    }
    await repo.remove(id)
    // 题目被改过（只置空 interviewId），同步刷新题目 store 的内存快照，
    // 否则列表页计数与详情页看到的还是旧关联。
    await useQuestionStore().refresh()
    await refresh()
    events.emit('interview:deleted', { id })
  }

  return { items, sorted, refresh, getById, questionCount, create, createMany, update, remove }
})
