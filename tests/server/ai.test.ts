import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AiReviewRequest, AiReviewResponse, ApiErrorBody } from '../../shared/api'
import type { AiService } from '../../server/modules/ai/service'
import { createAiService, parseReviewContent, type FetchLike } from '../../server/modules/ai/service'
import { makeTestApp, registerUser } from './app-helpers'

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

function req(over: Partial<AiReviewRequest> = {}): AiReviewRequest {
  return {
    content: '什么是闭包？',
    myAnswer: '函数和它外部变量的绑定……',
    category: 'JavaScript',
    tags: ['作用域'],
    ...over,
  }
}

function baseOptions(over: Partial<Parameters<typeof createAiService>[0]> = {}) {
  return {
    apiKey: 'sk-test-secret-key',
    baseUrl: 'https://ai.example.com/v1',
    model: 'test-model',
    timeoutMs: 5_000,
    ...over,
  }
}

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
}

const GOOD_JSON = JSON.stringify({
  idealAnswer: '先讲词法作用域，再讲引用保留……',
  suggestedTags: ['闭包', '作用域'],
  suggestions: ['补充内存释放的例子'],
})

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

async function review(
  app: FastifyInstance,
  token: string | null,
  payload: unknown,
): Promise<{ statusCode: number; body: AiReviewResponse | ApiErrorBody }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/ai/review',
    headers: token ? bearer(token) : {},
    payload,
  })
  return { statusCode: res.statusCode, body: res.json() }
}

/* ======================== service 层（mock fetch） ======================== */

describe('AI 服务：启用判定', () => {
  const refusingFetch: FetchLike = async () => {
    throw new Error('不应触达上游')
  }

  it('缺少 AI_API_KEY 时拒绝服务（AI_NOT_CONFIGURED / 503）', async () => {
    const svc = createAiService(baseOptions({ apiKey: undefined }), refusingFetch)
    await expect(svc.review(req())).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      statusCode: 503,
    })
  })

  it('缺少模型名时同样拒绝服务', async () => {
    const svc = createAiService(baseOptions({ model: undefined }), refusingFetch)
    await expect(svc.review(req())).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' })
  })

  it('空串密钥视同未配置', async () => {
    const svc = createAiService(baseOptions({ apiKey: '' }), refusingFetch)
    await expect(svc.review(req())).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' })
  })
})

describe('AI 服务：上游调用', () => {
  it('正常返回解析为 AiReviewResponse', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const svc = createAiService(baseOptions(), async (url, init) => {
      capturedUrl = url
      capturedInit = init
      return chatResponse(GOOD_JSON)
    })

    const result = await svc.review(req())
    expect(result).toEqual({
      idealAnswer: '先讲词法作用域，再讲引用保留……',
      suggestedTags: ['闭包', '作用域'],
      suggestions: ['补充内存释放的例子'],
    })
    expect(capturedUrl).toBe('https://ai.example.com/v1/chat/completions')
    const body = JSON.parse(String(capturedInit?.body)) as {
      model: string
      messages: { role: string; content: string }[]
    }
    expect(body.model).toBe('test-model')
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(body.messages[1].content).toContain('什么是闭包？')
    // 密钥只出现在 Authorization 头
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test-secret-key')
  })

  it('上游 5xx 映射为 AI_UPSTREAM_ERROR（502），cause 不丢', async () => {
    const svc = createAiService(baseOptions(), async () => new Response('boom', { status: 500 }))
    await expect(svc.review(req())).rejects.toMatchObject({
      code: 'AI_UPSTREAM_ERROR',
      statusCode: 502,
    })
  })

  it('网络异常映射为 AI_UPSTREAM_ERROR', async () => {
    const svc = createAiService(baseOptions(), async () => {
      throw new TypeError('fetch failed')
    })
    await expect(svc.review(req())).rejects.toMatchObject({
      code: 'AI_UPSTREAM_ERROR',
      statusCode: 502,
    })
  })

  it('上游超时映射为 AI_TIMEOUT（504）', async () => {
    const hanging: FetchLike = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    const svc = createAiService(baseOptions({ timeoutMs: 20 }), hanging)
    await expect(svc.review(req())).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
      statusCode: 504,
    })
  })

  it('响应缺 content 映射为 AI_UPSTREAM_ERROR', async () => {
    const svc = createAiService(
      baseOptions(),
      async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    )
    await expect(svc.review(req())).rejects.toMatchObject({ code: 'AI_UPSTREAM_ERROR' })
  })

  it('返回内容不是 JSON 时映射为 AI_UPSTREAM_ERROR', async () => {
    const svc = createAiService(baseOptions(), async () => chatResponse('抱歉，我无法回答'))
    await expect(svc.review(req())).rejects.toMatchObject({ code: 'AI_UPSTREAM_ERROR' })
  })

  it('上游错误文案不下发客户端（消息里没有上游细节）', async () => {
    const svc = createAiService(baseOptions(), async () => new Response('secret-upstream-detail', { status: 502 }))
    try {
      await svc.review(req())
      expect.unreachable('应抛出错误')
    } catch (err) {
      const e = err as { message: string; cause?: Error }
      expect(e.message).not.toContain('secret-upstream-detail')
      expect(e.message).not.toContain('sk-test-secret-key')
      expect(String(e.cause?.message ?? '')).toContain('upstream 502')
    }
  })
})

describe('parseReviewContent 容错解析', () => {
  it('解析普通 JSON 对象', () => {
    expect(parseReviewContent(GOOD_JSON).suggestedTags).toEqual(['闭包', '作用域'])
  })

  it('容忍 ```json 代码块围栏', () => {
    const fenced = '```json\n' + GOOD_JSON + '\n```'
    expect(parseReviewContent(fenced).idealAnswer).toContain('词法作用域')
  })

  it('suggestedTags / suggestions 非数组时降级为空', () => {
    const parsed = parseReviewContent(
      JSON.stringify({ idealAnswer: '答案', suggestedTags: '不是数组', suggestions: null }),
    )
    expect(parsed).toEqual({ idealAnswer: '答案', suggestedTags: [], suggestions: [] })
  })

  it('缺 idealAnswer 抛错', () => {
    expect(() => parseReviewContent(JSON.stringify({ suggestions: [] }))).toThrow()
  })

  it('非 JSON 文本抛错', () => {
    expect(() => parseReviewContent('plain text')).toThrow()
  })
})

/* ======================== controller 层（app.inject） ======================== */

describe('POST /api/ai/review', () => {
  it('未携带访问令牌返回 401', async () => {
    const t = await makeTestApp()
    app = t.app
    const r = await review(app, null, req())
    expect(r.statusCode).toBe(401)
  })

  it('缺 content 校验失败返回 400', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'ai-valid@example.com')
    const r = await review(app, u.accessToken, { myAnswer: 'x', category: 'JS' })
    expect(r.statusCode).toBe(400)
    expect((r.body as ApiErrorBody).error.code).toBe('VALIDATION_ERROR')
  })

  it('默认未配置密钥时返回 503 AI_NOT_CONFIGURED', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'ai-unconfigured@example.com')
    const r = await review(app, u.accessToken, req())
    expect(r.statusCode).toBe(503)
    expect((r.body as ApiErrorBody).error.code).toBe('AI_NOT_CONFIGURED')
  })

  it('注入 stub 服务返回 200，且响应体不含密钥痕迹', async () => {
    const stub: AiService = {
      async review() {
        return {
          idealAnswer: '理想回答',
          suggestedTags: ['标签'],
          suggestions: ['建议'],
        }
      },
    }
    const t = await makeTestApp({ aiService: stub })
    app = t.app
    const u = await registerUser(app, 'ai-stub@example.com')
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/review',
      headers: bearer(u.accessToken),
      payload: req(),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      idealAnswer: '理想回答',
      suggestedTags: ['标签'],
      suggestions: ['建议'],
    })
    expect(res.body).not.toContain('sk-')
    expect(res.body).not.toMatch(/apiKey|api_key|secret/i)
  })
})
