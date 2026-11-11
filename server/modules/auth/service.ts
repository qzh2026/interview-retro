import { randomUUID } from 'node:crypto'
import type { AuthUser, LoginRequest, RegisterRequest } from '../../../shared/api'
import { ERROR_CODES } from '../../../shared/api'
import { AppError } from '../../errors/app-error'
import { hashPassword, verifyPassword } from './password'
import type { AuthRepository, UserRow } from './repository'
import { generateRefreshToken, hashRefreshToken, type TokenVerifier } from './tokens'

/**
 * 服务层：承载鉴权业务规则，完全不依赖 HTTP 请求 / 响应对象。
 * Cookie 的读写与状态码映射由 controller 负责，这里只进出原始令牌字符串。
 */
export interface AuthResult {
  user: AuthUser
  accessToken: string
  expiresIn: number
  /** 原始刷新令牌，由 controller 写入 HttpOnly Cookie */
  refreshToken: string
  /** 刷新令牌有效期（毫秒时间戳） */
  refreshExpiresAt: Date
}

export interface AuthService {
  register(input: RegisterRequest): Promise<AuthResult>
  login(input: LoginRequest): Promise<AuthResult>
  /** 旋转刷新令牌：验证旧令牌 → 撤销旧令牌 → 签发新令牌 */
  refresh(rawToken: string): Promise<AuthResult>
  /** 幂等登出：令牌不存在也视为成功 */
  logout(rawToken: string | undefined): Promise<void>
}

export interface AuthServiceDeps {
  repo: AuthRepository
  tokens: TokenVerifier
  refreshTokenTtlDays: number
}

function toAuthUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, displayName: row.displayName }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { repo, tokens, refreshTokenTtlDays } = deps

  async function issueSession(user: UserRow): Promise<AuthResult> {
    const access = await tokens.signAccess({ userId: user.id, email: user.email })
    const { raw, hash } = generateRefreshToken()
    const refreshExpiresAt = new Date(Date.now() + refreshTokenTtlDays * 86_400_000)
    await repo.insertRefreshToken({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hash,
      expiresAt: refreshExpiresAt,
    })
    return {
      user: toAuthUser(user),
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken: raw,
      refreshExpiresAt,
    }
  }

  return {
    async register(input) {
      const email = normalizeEmail(input.email)
      const existing = await repo.findUserByEmail(email)
      if (existing) {
        // 注册场景允许提示「邮箱已注册」：用户本来就知道自己输过什么
        throw new AppError(ERROR_CODES.CONFLICT, 409, '该邮箱已注册，请直接登录')
      }

      const user: UserRow = {
        id: randomUUID(),
        email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName?.trim() || null,
      }
      await repo.createUser(user)
      return issueSession(user)
    },

    async login(input) {
      const email = normalizeEmail(input.email)
      const user = await repo.findUserByEmail(email)
      // 邮箱不存在与密码错误返回同一错误码与文案，避免用户枚举
      const invalid = new AppError(
        ERROR_CODES.INVALID_CREDENTIALS,
        401,
        '邮箱或密码不正确',
      )
      if (!user) {
        // 即使用户不存在也跑一次哈希，抹平响应时间差异
        await verifyPassword(input.password, 'scrypt$32768$8$1$AAAA$AAAA')
        throw invalid
      }
      const ok = await verifyPassword(input.password, user.passwordHash)
      if (!ok) throw invalid
      return issueSession(user)
    },

    async refresh(rawToken) {
      const row = await repo.findRefreshTokenByHash(hashRefreshToken(rawToken))
      const now = new Date()
      if (!row) throw AppError.unauthorized('登录已失效，请重新登录')

      // 令牌复用检测：已撤销的令牌再次出现 → 视为泄露，撤销该用户全部会话
      if (row.revokedAt) {
        await repo.revokeAllUserTokens(row.userId, now)
        throw AppError.unauthorized('登录已失效，请重新登录')
      }
      if (row.expiresAt.getTime() <= now.getTime()) {
        throw AppError.unauthorized('登录已过期，请重新登录')
      }

      const user = await repo.findUserById(row.userId)
      if (!user) throw AppError.unauthorized('登录已失效，请重新登录')

      await repo.revokeRefreshToken(row.id, now)
      return issueSession(user)
    },

    async logout(rawToken) {
      if (!rawToken) return
      const row = await repo.findRefreshTokenByHash(hashRefreshToken(rawToken))
      if (row && !row.revokedAt) {
        await repo.revokeRefreshToken(row.id, new Date())
      }
    },
  }
}
