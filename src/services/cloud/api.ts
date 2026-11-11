import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
  SyncChangeInput,
  SyncPullResponse,
  SyncPushResponse,
} from '../../../shared/api'
import { request } from './http'

/**
 * 鉴权与同步的类型化 API。
 * 页面与插件一律通过这里访问后端，禁止散落的裸 fetch。
 */
export const cloudApi = {
  register(input: RegisterRequest): Promise<AuthResponse> {
    return request('/api/auth/register', { method: 'POST', json: input })
  },

  login(input: LoginRequest): Promise<AuthResponse> {
    return request('/api/auth/login', { method: 'POST', json: input })
  },

  /** 用 HttpOnly Cookie 换新访问令牌；失败抛 ApiClientError */
  refresh(): Promise<AuthResponse> {
    return request('/api/auth/refresh', { method: 'POST' })
  },

  logout(): Promise<LogoutResponse> {
    return request('/api/auth/logout', { method: 'POST' })
  },

  me(): Promise<{ user: AuthUser }> {
    return request('/api/auth/me')
  },

  /** 幂等（changeId），允许网络/5xx 自动重试 */
  push(changes: SyncChangeInput[]): Promise<SyncPushResponse> {
    return request('/api/sync/push', { method: 'POST', json: { changes }, retry: true })
  },

  pull(since: number): Promise<SyncPullResponse> {
    return request(`/api/sync/pull?since=${since}`, { retry: true })
  },
}
