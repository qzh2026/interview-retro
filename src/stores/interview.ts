import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Interview, InterviewInput } from '@/types'
import { events } from '@/core/extensions/registry'
import { createRepository } from '@/services/repository'
import { newId } from '@/utils/id'
import { nowISO, todayISO } from '@/utils/date'

const repo = createRepository('interviews')
const questionRepo = createRepository('questions')

export const useInterviewStore = defineStore('interviews', () => {
  const items = ref<Interview[]>([])

  function refresh(): void {
    items.value = repo.all()
  }
  refresh()

  const sorted = computed(() =>
    [...items.value].sort((a, b) => b.date.localeCompare(a.date)),
  )

  function getById(id: string): Interview | null {
    return items.value.find((item) => item.id === id) ?? null
  }

  function questionCount(id: string): number {
    return questionRepo.all().filter((q) => q.interviewId === id).length
  }

  function create(input: InterviewInput): Interview {
    const ts = nowISO()
    const item: Interview = {
      ...input,
      date: input.date || todayISO(),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    }
    repo.insert(item)
    refresh()
    events.emit('interview:created', item)
    return item
  }

  /** 批量导入用：一次写盘，逐条派发事件，避免 N 次全量读写 */
  function createMany(inputs: InterviewInput[]): Interview[] {
    if (inputs.length === 0) return []
    const ts = nowISO()
    const created: Interview[] = inputs.map((input) => ({
      ...input,
      date: input.date || todayISO(),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    }))
    repo.insertMany(created)
    refresh()
    created.forEach((item) => events.emit('interview:created', item))
    return created
  }

  function update(id: string, patch: Partial<Interview>): void {
    const next = repo.update(id, patch)
    refresh()
    if (next) events.emit('interview:updated', next)
  }

  function remove(id: string): void {
    // 删场次不删题：题目是复盘资产，只解除关联，避免误删历史记录
    questionRepo
      .all()
      .filter((q) => q.interviewId === id)
      .forEach((q) => questionRepo.update(q.id, { interviewId: null }))
    repo.remove(id)
    refresh()
    events.emit('interview:deleted', { id })
  }

  return { items, sorted, refresh, getById, questionCount, create, createMany, update, remove }
})
