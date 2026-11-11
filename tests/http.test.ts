import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, request, toUserMessage } from '../src/services/cloud/http'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('请求超时', () => {
  it('挂起的请求按 timeoutMs 中止并抛 TIMEOUT', async () => {
    const hanging = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', hanging)

    await expect(request('/api/anything', { timeoutMs: 20 })).rejects.toMatchObject({
      code: 'TIMEOUT',
      status: 0,
      message: '请求超时，请检查网络后重试',
    })
    expect(hanging).toHaveBeenCalledTimes(1)
  })

  it('挂起请求最终不产生未处理的定时器泄漏（超时后 fetch 已中止）', async () => {
    let aborted = false
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              aborted = true
              reject(new DOMException('aborted', 'AbortError'))
            })
          }),
      ),
    )
    await expect(request('/api/anything', { timeoutMs: 10 })).rejects.toThrow()
    expect(aborted).toBe(true)
  })
})

describe('网络错误映射', () => {
  it('fetch 拒绝映射为 NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    await expect(request('/api/anything', { timeoutMs: 100 })).rejects.toMatchObject({
      code: 'NETWORK',
      message: '网络连接失败，请检查网络后重试',
    })
  })

  it('5xx 响应解析错误体后抛 ApiClientError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { code: 'INTERNAL', message: '服务器内部错误，请稍后重试' } }),
          { status: 500 },
        ),
      ),
    )
    await expect(request('/api/anything', { timeoutMs: 100 })).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    })
  })
})

describe('toUserMessage 统一错误映射', () => {
  it('ApiClientError 使用自带中文文案', () => {
    const err = new ApiClientError('AI_NOT_CONFIGURED', 'AI 复盘未启用', 503)
    expect(toUserMessage(err)).toBe('AI 复盘未启用')
  })

  it('普通 Error 取 message', () => {
    expect(toUserMessage(new Error('字段不合法'))).toBe('字段不合法')
  })

  it('非 Error 对象给兜底文案', () => {
    expect(toUserMessage('boom')).toBe('操作失败，请稍后重试')
    expect(toUserMessage(undefined)).toBe('操作失败，请稍后重试')
  })
})
