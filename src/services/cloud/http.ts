import type { AuthResponse } from '../../../shared/api'
import { session } from './session'

/**
 * 类型化 fetch 封装。
 *
 * 规则：
 * - Base URL 走 VITE_API_BASE（可空 = 同源，开发环境由 Vite proxy 转发）；
 * - credentials: 'include' 让 HttpOnly 刷新 Cookie 跟随请求；
 * - 访问令牌自动附加为 Bearer，401 时自动 refresh 并重试一次；
 * - 4xx 不重试；网络失败 / 5xx 对幂等请求最多重试 2 次；
 * - 每次请求带超时（AbortController），挂起的请求不会永远卡住；
 * - 错误统一抛 ApiClientError（code + 中文文案），页面直接展示 message。
 */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

/** 单次请求超时（毫秒）：慢网络下快速失败，给用户明确文案而不是无限转圈 */
const REQUEST_TIMEOUT_MS = 15_000

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

/**
 * 把任意异常映射为可直接展示的中文文案。
 * 视图层 catch 后统一走这里，不再各写各的提示。
 */
export function toUserMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message
  if (err instanceof Error && err.message) return err.message
  return '操作失败，请稍后重试'
}

/** 连不上后端的错误（网络断 / 超时 / 静态托管或网关返回的非 JSON 响应），用于给「无后端」友好提示。
 *  注意：真实后端返回的 JSON 404/5xx 说明服务是活的，不算「连不上」，不在其列。 */
export function isBackendUnreachable(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false
  return err.code === 'SERVICE_UNREACHABLE' || err.code === 'NETWORK' || err.code === 'TIMEOUT'
}

/** 后端不可达时的统一提示：覆盖「在线 Demo 纯静态」与「自建后端没起」两种情形 */
export const CLOUD_UNREACHABLE_HINT =
  '连不上云同步后端。在线 Demo 是纯静态部署、不含后端；本地模式不受影响。自建后端见 README「部署」章节。'

/** 带超时的 fetch：超时抛 AbortError（name=AbortError） */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

let refreshInFlight: Promise<boolean> | null = null

/** 用刷新 Cookie 换新访问令牌；并发调用共享同一次请求 */
function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetchWithTimeout(
          `${API_BASE}/api/auth/refresh`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          },
          REQUEST_TIMEOUT_MS,
        )
        if (!res.ok) {
          session.clearSession()
          return false
        }
        const body = (await res.json()) as AuthResponse
        session.setSession(body.user, body.accessToken)
        return true
      } catch {
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON 请求体（自动序列化并设置 Content-Type） */
  json?: unknown
  /** 网络失败 / 5xx 时是否自动重试（幂等请求才开） */
  retry?: boolean
  /** 单次请求超时（毫秒），默认 15s */
  timeoutMs?: number
}

const RETRY_DELAYS_MS = [200, 400]

async function doFetch(path: string, init: RequestOptions): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`)

  // 超时 + 外部取消（如用户主动取消 AI 请求）共用一个 AbortController
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? REQUEST_TIMEOUT_MS)
  const external = init.signal
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', () => controller.abort(), { once: true })
  }
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers,
      credentials: 'include',
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export async function request<T>(
  path: string,
  init: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const maxAttempts = init.retry ? RETRY_DELAYS_MS.length + 1 : 1
  let res: Response | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      res = await doFetch(path, init)
    } catch (err) {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        continue
      }
      // 超时（AbortError）与网络断开分开给文案，便于用户判断
      const aborted = err instanceof Error && err.name === 'AbortError'
      throw new ApiClientError(
        aborted ? 'TIMEOUT' : 'NETWORK',
        aborted ? '请求超时，请检查网络后重试' : '网络连接失败，请检查网络后重试',
        0,
      )
    }
    // 5xx 可重试；4xx（含 401/429）直接走后续处理
    if (res.status >= 500 && attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      continue
    }
    break
  }
  if (!res) throw new ApiClientError('NETWORK', '网络连接失败，请检查网络后重试', 0)

  // 访问令牌过期：刷新一次后原样重发（只重试一次，避免死循环）
  if (res.status === 401 && !isRetry && !path.startsWith('/api/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, init, true)
    session.clearSession()
  }

  if (!res.ok) {
    let code = 'INTERNAL'
    let message = `请求失败（HTTP ${res.status}）`
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } }
      code = body.error?.code ?? code
      message = body.error?.message ?? message
    } catch {
      // 响应不是 JSON（如纯静态托管对 /api/* 返回的 404 HTML 页）→ 视为后端不可达，
      // 让上层能给「在线 Demo 无后端 / 自建后端未启动」的友好提示，而不是抛解析异常
      if (res.status === 404 || res.status >= 502) {
        code = 'SERVICE_UNREACHABLE'
        message = '无法连接云同步服务'
      }
    }
    throw new ApiClientError(code, message, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
