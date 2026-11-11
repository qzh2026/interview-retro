import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudAiAdapter } from '../src/plugins/cloud-ai'
import { session } from '../src/services/cloud/session'

const adapter = createCloudAiAdapter()

const reviewReq = {
  content: '什么是闭包？',
  myAnswer: '函数……',
  category: 'JavaScript',
  tags: ['作用域'],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  session.setSession({ id: 'u-1', email: 'ai@example.com', displayName: null }, 'test-access-token')
})

afterEach(() => {
  session.clearSession()
  vi.unstubAllGlobals()
})

describe('cloud-ai 适配器', () => {
  it('未登录时给出友好提示，不发请求', async () => {
    session.clearSession()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(adapter.review(reviewReq)).rejects.toThrow('请先登录后再使用 AI 复盘')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('经 POST /api/ai/review 调后端代理，携带 Bearer 令牌', async () => {
    const payload = { idealAnswer: '答案', suggestedTags: ['闭包'], suggestions: ['多练'] }
    const fetchMock = vi.fn(async () => jsonResponse(payload))
    vi.stubGlobal('fetch', fetchMock)

    const result = await adapter.review(reviewReq)

    expect(result).toEqual(payload)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/review')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-access-token')
    expect(JSON.parse(String(init.body))).toEqual(reviewReq)
  })

  it('服务端错误文案透传为普通 Error（如 AI_NOT_CONFIGURED）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'AI_NOT_CONFIGURED',
              message: 'AI 复盘未启用：服务端尚未配置 AI_API_KEY 与 AI_MODEL',
              requestId: 'req-1',
            },
          },
          503,
        ),
      ),
    )

    await expect(adapter.review(reviewReq)).rejects.toThrow(
      'AI 复盘未启用：服务端尚未配置 AI_API_KEY 与 AI_MODEL',
    )
  })

  it('网络失败给出离线提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    // 5xx/网络失败对非幂等请求只重试 0 次？—— POST 未开 retry，直接网络错误
    await expect(adapter.review(reviewReq)).rejects.toThrow('网络连接失败')
  })
})
