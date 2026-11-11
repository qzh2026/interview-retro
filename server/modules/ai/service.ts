import type { AiReviewRequest, AiReviewResponse } from '../../../shared/api'
import { AppError } from '../../errors/app-error'

/**
 * AI 复盘代理服务（Stage 5）。
 *
 * 职责：把 AiReviewRequest 转成 OpenAI 兼容 chat completions 调用，
 * 将返回内容解析为 AiReviewResponse。密钥只在服务端内存中使用：
 * 不进日志、不进错误文案、不进任何响应体。
 *
 * 服务层不依赖 fastify 类型；fetch 可注入，单测不打真实网络。
 */

export interface AiServiceOptions {
  /** 上游 API 密钥；undefined = 未启用 */
  apiKey: string | undefined
  /** OpenAI 兼容接口地址，如 https://api.openai.com/v1 */
  baseUrl: string
  /** 模型名；与 apiKey 同时存在才视为已启用 */
  model: string | undefined
  /** 上游调用超时（毫秒） */
  timeoutMs: number
}

/** 可注入的 fetch 签名 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface AiService {
  review(req: AiReviewRequest): Promise<AiReviewResponse>
}

const SYSTEM_PROMPT = [
  '你是一位资深面试官与技术面试教练。',
  '请针对用户给出的面试题目、他的回答与题目分类，输出复盘分析。',
  '必须只输出一个 JSON 对象，不要输出任何其他文字，字段如下：',
  '{"idealAnswer": "这道题理想的回答思路（字符串，讲清关键点与结构）",',
  ' "suggestedTags": ["建议的标签，字符串数组"],',
  ' "suggestions": ["针对用户回答的改进建议，字符串数组，每条一句话"]}',
].join('\n')

function buildUserPrompt(req: AiReviewRequest): string {
  const tags = req.tags && req.tags.length > 0 ? req.tags.join('、') : '（无）'
  return [
    `题目分类：${req.category || '（未分类）'}`,
    `标签：${tags}`,
    `题目：${req.content}`,
    `我的回答：${req.myAnswer || '（当时没有回答上来）'}`,
  ].join('\n')
}

/**
 * 容错解析上游返回内容：
 * - 允许 ```json ... ``` 代码块围栏；
 * - 字段缺失时 suggestedTags / suggestions 降级为空数组；
 * - idealAnswer 必须是字符串，否则视为上游返回不合格。
 */
export function parseReviewContent(raw: string): AiReviewResponse {
  let text = raw.trim()
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) text = fence[1].trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new Error('AI 返回内容不是合法 JSON', { cause })
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('AI 返回内容不是 JSON 对象')
  }
  const obj = parsed as Record<string, unknown>

  const idealAnswer = obj.idealAnswer
  if (typeof idealAnswer !== 'string' || idealAnswer.trim() === '') {
    throw new Error('AI 返回内容缺少 idealAnswer')
  }
  const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  return {
    idealAnswer,
    suggestedTags: toStringArray(obj.suggestedTags),
    suggestions: toStringArray(obj.suggestions),
  }
}

function upstreamError(message: string, cause?: unknown): AppError {
  return new AppError('AI_UPSTREAM_ERROR', 502, message, undefined, { cause })
}

export function createAiService(options: AiServiceOptions, fetchImpl: FetchLike = fetch): AiService {
  return {
    async review(req: AiReviewRequest): Promise<AiReviewResponse> {
      const { apiKey, model, baseUrl, timeoutMs } = options
      if (!apiKey || !model) {
        throw new AppError(
          'AI_NOT_CONFIGURED',
          503,
          'AI 复盘未启用：服务端尚未配置 AI_API_KEY 与 AI_MODEL',
        )
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // 密钥只出现在这一个请求头里，不进日志（logger 已 redact authorization）
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildUserPrompt(req) },
            ],
            // OpenAI 兼容的 JSON 输出模式（DeepSeek / Kimi / Qwen / Moonshot 均支持）
            response_format: { type: 'json_object' },
            temperature: 0.3,
          }),
          signal: controller.signal,
        })
      } catch (cause) {
        if (controller.signal.aborted) {
          throw new AppError('AI_TIMEOUT', 504, 'AI 服务响应超时，请稍后重试', undefined, { cause })
        }
        throw upstreamError('AI 服务暂不可用，请稍后重试', cause)
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) {
        // 上游状态码与响应片段只进服务端日志（handler 会记 cause），不下发客户端
        const snippet = await res.text().catch(() => '')
        throw upstreamError(
          'AI 服务暂不可用，请稍后重试',
          new Error(`upstream ${res.status}: ${snippet.slice(0, 200)}`),
        )
      }

      let content: string
      try {
        const body = (await res.json()) as {
          choices?: { message?: { content?: unknown } }[]
        }
        const raw = body.choices?.[0]?.message?.content
        if (typeof raw !== 'string') throw new Error('choices[0].message.content 缺失')
        content = raw
      } catch (cause) {
        throw upstreamError('AI 服务返回了无法识别的内容', cause)
      }

      try {
        return parseReviewContent(content)
      } catch (cause) {
        throw upstreamError('AI 服务返回了无法识别的内容', cause)
      }
    },
  }
}
