import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { AuthUser, LoginRequest, RegisterRequest } from '../../shared/api'
import { cloudApi } from '@/services/cloud/api'
import { toUserMessage } from '@/services/cloud/http'
import { session } from '@/services/cloud/session'
import { handleLogin, handleLogout, syncNow } from '@/services/cloud/engine'
import { resetSyncStatus } from '@/services/cloud/status'

/**
 * 账号状态。
 *
 * 访问令牌不进 store 的持久化（根本没有持久化）——只活在 services/cloud/session
 * 的内存变量里；刷新靠 HttpOnly Cookie。页面刷新后由 cloud-sync 插件静默 restore。
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(session.user)
  const pending = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => user.value !== null)

  function applySession(next: AuthUser): void {
    user.value = next
    error.value = null
  }

  async function run(fn: () => Promise<void>): Promise<boolean> {
    pending.value = true
    error.value = null
    try {
      await fn()
      return true
    } catch (err) {
      error.value = toUserMessage(err)
      return false
    } finally {
      pending.value = false
    }
  }

  async function register(input: RegisterRequest): Promise<boolean> {
    return run(async () => {
      const res = await cloudApi.register(input)
      session.setSession(res.user, res.accessToken)
      applySession(res.user)
      await handleLogin(res.user.id)
    })
  }

  async function login(input: LoginRequest): Promise<boolean> {
    return run(async () => {
      const res = await cloudApi.login(input)
      session.setSession(res.user, res.accessToken)
      applySession(res.user)
      await handleLogin(res.user.id)
    })
  }

  async function logout(): Promise<void> {
    await run(async () => {
      try {
        await cloudApi.logout()
      } catch {
        // 服务端登出失败也要清本地会话：Cookie 可能已过期
      }
      session.clearSession()
      user.value = null
      handleLogout()
    })
  }

  /** 手动「立即同步」按钮 */
  async function sync(): Promise<void> {
    await run(async () => {
      await syncNow()
    })
  }

  return { user, pending, error, isAuthenticated, register, login, logout, sync, applySession }
})

/** 启动期静默恢复会话（由 cloud-sync 插件调用），失败即视为未登录 */
export async function tryRestoreSession(): Promise<AuthUser | null> {
  try {
    const res = await cloudApi.refresh()
    session.setSession(res.user, res.accessToken)
    return res.user
  } catch {
    session.clearSession()
    resetSyncStatus()
    return null
  }
}
