import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { AppError } from '../../errors/app-error'

/**
 * 访问令牌（JWT，HS256）与刷新令牌（随机值 + 服务端 hash）的签发与验证。
 *
 * 安全约定：
 * - 访问令牌短时效（默认 15 分钟），只放客户端内存；
 * - 刷新令牌是不透明随机值，服务端只存 SHA-256 hash，可主动撤销；
 * - 验证失败一律抛 UNAUTHORIZED，不区分「过期 / 伪造」细节。
 */

export interface AccessClaims {
  userId: string
  email: string
}

export interface TokenVerifier {
  signAccess(claims: AccessClaims): Promise<{ token: string; expiresIn: number }>
  verifyAccess(token: string): Promise<AccessClaims>
}

export function createTokenVerifier(secret: string, ttlSeconds: number): TokenVerifier {
  const key = new TextEncoder().encode(secret)

  return {
    async signAccess(claims: AccessClaims) {
      const token = await new SignJWT({ email: claims.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.userId)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
        .sign(key)
      return { token, expiresIn: ttlSeconds }
    },

    async verifyAccess(token: string): Promise<AccessClaims> {
      try {
        const { payload } = await jwtVerify(token, key)
        if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
          throw new Error('missing sub')
        }
        return {
          userId: payload.sub,
          email: typeof payload.email === 'string' ? payload.email : '',
        }
      } catch {
        throw AppError.unauthorized('登录已过期，请重新登录')
      }
    },
  }
}

/** 刷新令牌：32 字节随机值（客户端持有），服务端只留 SHA-256 hash */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  return { raw, hash: hashRefreshToken(raw) }
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
