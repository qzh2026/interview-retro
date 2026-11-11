import type { AuthUser } from '../../../shared/api'

/**
 * 会话内存态。
 *
 * 安全约定（不可妥协）：访问令牌只活在本模块的内存变量里，
 * 严禁写入 localStorage / sessionStorage / URL —— 刷新页面后只能靠
 * HttpOnly Cookie 里的刷新令牌重新换发。用户信息跟随令牌一起清除。
 */
let accessToken: string | null = null
let currentUser: AuthUser | null = null

export const session = {
  get user(): AuthUser | null {
    return currentUser
  },
  get accessToken(): string | null {
    return accessToken
  },
  get isAuthenticated(): boolean {
    return currentUser !== null && accessToken !== null
  },

  setSession(user: AuthUser, token: string): void {
    currentUser = user
    accessToken = token
  },

  setAccessToken(token: string): void {
    accessToken = token
  },

  clearSession(): void {
    currentUser = null
    accessToken = null
  },
}
