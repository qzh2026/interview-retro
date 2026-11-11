import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AsyncStorageAdapter, Plugin, StorageAdapter } from '@/sdk'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '@/constants'
import { localStorageAdapter } from '@/core/extensions/local-storage-adapter'
import { getActiveAdapters, installPlugin } from '@/core/extensions/registry'
import { getStorageGateway, wrapSyncAdapter } from '@/services/storage-gateway'
import { loadState, saveState } from '@/services/storage'
import type { PersistedState } from '@/types'
import { makeInterview } from './helpers'

/**
 * 网关契约回归：
 * 1. 同步适配器签名不变，被自动包成 Promise —— README 里的 sessionStorage 示例插件零改动可用；
 * 2. 注册 AsyncStorageAdapter 后由它接管，同步适配器完全不参与 IO。
 *
 * 注意：最后两个用例会往全局注册表里装适配器且不可逆，必须排在本文件末尾。
 * vitest 默认按文件隔离模块实例，不会污染其它测试文件。
 */
function stateWith(company: string): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    interviews: [makeInterview({ company })],
    questions: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

beforeEach(() => {
  localStorageAdapter.clear()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('wrapSyncAdapter：v1 同步适配器零改动可用', () => {
  it('read / write / clear 都变成 Promise，且转发到原对象', async () => {
    let raw: string | null = null
    const sync: StorageAdapter = {
      id: 'test:sync',
      label: '测试同步适配器',
      read: () => raw,
      write: (value) => { raw = value },
      clear: () => { raw = null },
    }

    const wrapped = wrapSyncAdapter(sync)
    expect(wrapped.id).toBe('test:sync')
    expect(wrapped.label).toBe('测试同步适配器')
    expect(await wrapped.read()).toBeNull()

    await wrapped.write('hello')
    expect(await wrapped.read()).toBe('hello')
    expect(raw).toBe('hello')

    await wrapped.clear()
    expect(await wrapped.read()).toBeNull()
  })

  it('同步适配器里直接 throw 会变成 rejected promise，交给上层统一吞掉', async () => {
    const sync: StorageAdapter = {
      id: 'test:throws',
      label: '会抛错的适配器',
      read: () => { throw new Error('boom') },
      write: () => {},
      clear: () => {},
    }
    await expect(wrapSyncAdapter(sync).read()).rejects.toThrow('boom')
  })
})

describe('getStorageGateway：适配器解析优先级', () => {
  it('未注册 async 适配器时，包装默认 localStorageAdapter', async () => {
    expect(getStorageGateway().id).toBe(localStorageAdapter.id)
    await saveState(stateWith('本地公司'))
    expect((await loadState()).interviews[0].company).toBe('本地公司')
  })

  it('插件注册的同步适配器也能被网关包装（旧扩展点不失效）', async () => {
    let raw: string | null = null
    const sync: StorageAdapter = {
      id: 'test:custom-sync',
      label: '插件同步适配器',
      read: () => raw,
      write: (value) => { raw = value },
      clear: () => { raw = null },
    }
    const plugin: Plugin = {
      manifest: { id: 'test:custom-sync-plugin', name: '同步适配器插件', version: '1.0.0', contributes: ['storageAdapter'] },
      setup: (ctx) => ctx.useStorageAdapter(sync),
    }
    await installPlugin(plugin)

    expect(getStorageGateway().id).toBe('test:custom-sync')
    await saveState(stateWith('同步插件公司'))
    expect((await loadState()).interviews[0].company).toBe('同步插件公司')
    expect(raw).toContain('同步插件公司')
  })

  it('注册 AsyncStorageAdapter 后它接管全部 IO，同步适配器不再被写', async () => {
    let raw: string | null = null
    let writes = 0
    const asyncAdapter: AsyncStorageAdapter = {
      id: 'test:async',
      label: '测试异步适配器',
      async read() { await Promise.resolve(); return raw },
      async write(value) { await Promise.resolve(); raw = value; writes += 1 },
      async clear() { await Promise.resolve(); raw = null },
    }
    const plugin: Plugin = {
      manifest: { id: 'test:async-plugin', name: '异步适配器插件', version: '1.0.0', contributes: ['asyncStorageAdapter'] },
      setup: (ctx) => ctx.useAsyncStorageAdapter(asyncAdapter),
    }
    await installPlugin(plugin)

    expect(getStorageGateway().id).toBe('test:async')
    expect(getActiveAdapters().asyncStorage?.id).toBe('test:async')

    await saveState(stateWith('异步公司'))
    expect(writes).toBe(1)
    expect((await loadState()).interviews[0].company).toBe('异步公司')
    expect(localStorageAdapter.read()).toBeNull()
  })
})
