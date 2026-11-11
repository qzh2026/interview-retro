import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthResponse, LoginRequest, RegisterRequest } from '../../../shared/api'
import type { AppConfig } from '../../config/env'
import { AppError } from '../../errors/app-error'
import { validate } from '../../core/validate'
import type { AccessClaims, TokenVerifier } from './tokens'
import type { AuthResult, AuthService } from './service'

/** 控制器：只负责解析请求、调用服务、格式化响应，不写业务逻辑 */

const REFRESH_COOKIE = 'refresh_token'

const RegisterSchema = z.object({
  email: z
    .string()
    .min(3)
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, '邮箱格式不正确'),
  password: z.string().min(8).max(128),
  displayName: z.string().max(64).optional(),
})

const LoginSchema = z.object({
  email: z.string().min(3).max(254),
  password: z.string().min(1).max(128),
})

function cookieOptions(config: AppConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.isProduction,
    path: '/api',
  }
}

function toAuthResponse(result: AuthResult): AuthResponse {
  return {
    user: result.user,
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
  }
}

/**
 * 从 Authorization: Bearer <token> 解析并验证访问令牌。
 * 放在 controller 层做边界校验：服务层永远只接收已验证的身份。
 */
export async function authenticate(
  request: FastifyRequest,
  tokens: TokenVerifier,
): Promise<AccessClaims> {
  const header = request.headers.authorization
  const token =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : ''
  if (!token) throw AppError.unauthorized()
  return tokens.verifyAccess(token)
}

export function registerAuthRoutes(
  app: FastifyInstance,
  service: AuthService,
  tokens: TokenVerifier,
  config: AppConfig,
): void {
  // 路由级限流：只保护鉴权端点，其余路由不受影响
  const rateLimit = { rateLimit: { max: config.authRateLimitMax, timeWindow: '1 minute' } }
  const cookieOpts = cookieOptions(config)
  const maxAgeSeconds = config.refreshTokenTtlDays * 86_400

  app.post('/api/auth/register', { config: rateLimit }, async (request, reply: FastifyReply) => {
    const input = validate(RegisterSchema, request.body) as RegisterRequest
    const result = await service.register(input)
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOpts, maxAge: maxAgeSeconds })
    return toAuthResponse(result)
  })

  app.post('/api/auth/login', { config: rateLimit }, async (request, reply: FastifyReply) => {
    const input = validate(LoginSchema, request.body) as LoginRequest
    const result = await service.login(input)
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOpts, maxAge: maxAgeSeconds })
    return toAuthResponse(result)
  })

  app.post('/api/auth/refresh', { config: rateLimit }, async (request, reply: FastifyReply) => {
    const raw = request.cookies[REFRESH_COOKIE]
    if (!raw) throw AppError.unauthorized()
    const result = await service.refresh(raw)
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOpts, maxAge: maxAgeSeconds })
    return toAuthResponse(result)
  })

  app.post('/api/auth/logout', async (request, reply: FastifyReply) => {
    await service.logout(request.cookies[REFRESH_COOKIE])
    reply.clearCookie(REFRESH_COOKIE, { path: '/api' })
    return { ok: true as const }
  })

  // 自检端点：前端启动时确认访问令牌是否有效（失败返回 401，由客户端决定是否 refresh）
  app.get('/api/auth/me', async (request) => {
    const claims = await authenticate(request, tokens)
    return { user: { id: claims.userId, email: claims.email, displayName: null } }
  })
}
