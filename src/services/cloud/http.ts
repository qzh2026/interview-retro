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
 * - 错误统一抛 ApiClientError（code + 中文文案），页面直接展示 message。
 */
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/$/, '')

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

let refreshInFlight: Promise<boolean> | null = null

/** 用刷新 Cookie 换新访问令牌；并发调用共享同一次请求 */
function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })
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
}

const RETRY_DELAYS_MS = [200, 400]

async function doFetch(path: string, init: RequestOptions): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')
  if (session.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`)

  return fetch(`${API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    credentials: 'include',
    body: init.json === undefined ? undefined : JSON.stringify(init.json),
  })
}

export async function request<T>(path: string, init: RequestOptions = {}, isRetry = false): Promise<T> {
  const maxAttempts = init.retry ? RETRY_DELAYS_MS.length + 1 : 1
  let res: Response | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      res = await doFetch(path, init)
    } catch {
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
        continue
      }
      throw new ApiClientError('NETWORK', '网络连接失败，请检查网络后重试', 0)
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
      // 响应不是 JSON 时保留默认文案
    }
    throw new ApiClientError(code, message, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
