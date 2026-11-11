import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import { clearStorageIssue } from '@/services/storage-health'
import { createRepository } from '@/services/repository'
import { makeInterview, makeQuestion } from './helpers'

/**
 * registry 持有的 storageAdapter 就是 localStorageAdapter 这个对象本身，
 * 对它 spy 即可统计 storage.ts 的落盘次数，用来守住批量导入的性能契约。
 */
beforeEach(() => {
  localStorageAdapter.clear()
  clearStorageIssue()
})

describe('createRepository CRUD', () => {
  it('insert 后可读回，find 命中与未命中行为正确', () => {
    const repo = createRepository('questions')
    const inserted = repo.insert(makeQuestion({ id: 'q1', content: '题一' }))

    expect(inserted.content).toBe('题一')
    expect(repo.find('q1')?.content).toBe('题一')
    expect(repo.find('missing')).toBeNull()
    expect(repo.all()).toHaveLength(1)
  })

  it('新记录排在前面，且 all() 返回的是新数组', () => {
    const repo = createRepository('interviews')
    repo.insert(makeInterview({ id: 'old' }))
    repo.insert(makeInterview({ id: 'new' }))

    expect(repo.all().map((i) => i.id)).toEqual(['new', 'old'])
    const snapshot = repo.all()
    snapshot.pop()
    expect(repo.all()).toHaveLength(2)
  })

  it('update 合并 patch 并刷新 updatedAt；不存在的 id 返回 null', () => {
    const repo = createRepository('questions')
    repo.insert(makeQuestion({ id: 'q1', content: '旧答案', updatedAt: '2020-01-01T00:00:00.000Z' }))

    const next = repo.update('q1', { content: '新答案' })
    expect(next?.content).toBe('新答案')
    expect(next?.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
    expect(repo.find('q1')?.content).toBe('新答案')
    expect(repo.update('missing', { content: 'x' })).toBeNull()
  })

  it('remove 与 replaceAll 按预期工作', () => {
    const repo = createRepository('interviews')
    repo.insertMany([makeInterview({ id: 'a' }), makeInterview({ id: 'b' })])

    expect(repo.remove('a')).toBe(true)
    expect(repo.remove('a')).toBe(false)
    expect(repo.all().map((i) => i.id)).toEqual(['b'])

    repo.replaceAll([makeInterview({ id: 'c' })])
    expect(repo.all().map((i) => i.id)).toEqual(['c'])
  })
})

describe('批量导入的写入次数契约', () => {
  it('insertMany 三条只落盘一次', () => {
    const writeSpy = vi.spyOn(localStorageAdapter, 'write')
    const repo = createRepository('questions')
    const items = [
      makeQuestion({ id: 'a' }),
      makeQuestion({ id: 'b' }),
      makeQuestion({ id: 'c' }),
    ]

    const result = repo.insertMany(items)
    expect(result).toHaveLength(3)
    expect(repo.all()).toHaveLength(3)
    expect(writeSpy).toHaveBeenCalledTimes(1)
  })

  it('逐条 insert 三条会落盘三次（反面对照）', () => {
    const writeSpy = vi.spyOn(localStorageAdapter, 'write')
    const repo = createRepository('questions')

    repo.insert(makeQuestion({ id: 'a' }))
    repo.insert(makeQuestion({ id: 'b' }))
    repo.insert(makeQuestion({ id: 'c' }))

    expect(writeSpy).toHaveBeenCalledTimes(3)
  })

  it('insertMany 空数组直接返回，不产生写操作', () => {
    const writeSpy = vi.spyOn(localStorageAdapter, 'write')
    expect(createRepository('questions').insertMany([])).toEqual([])
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
