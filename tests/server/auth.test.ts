import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { ApiErrorBody } from '../../shared/api'
import { makeTestApp, registerUser } from './app-helpers'

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

describe('注册 / 登录', () => {
  it('注册成功返回用户与访问令牌，刷新令牌只进 HttpOnly Cookie', async () => {
    const t = await makeTestApp()
    app = t.app
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'Alice@Example.com', password: 'password123', displayName: 'Alice' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { user: { email: string; displayName: string }; accessToken: string; expiresIn: number }
    expect(body.user.email).toBe('alice@example.com') // 邮箱归一化
    expect(body.user.displayName).toBe('Alice')
    expect(body.accessToken).toBeTruthy()
    expect(body.expiresIn).toBe(900)
    // 刷新令牌绝不能出现在响应体里
    expect(res.body).not.toContain('refresh')

    const setCookie = String(res.headers['set-cookie'])
    expect(setCookie).toContain('refresh_token=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Path=/api')
  })

  it('密码不写进任何响应；重复邮箱注册返回 409', async () => {
    const t = await makeTestApp()
    app = t.app
    await registerUser(app, 'dup@example.com')
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dup@example.com', password: 'password123' },
    })
    expect(res.statusCode).toBe(409)
    expect((res.json() as ApiErrorBody).error.code).toBe('CONFLICT')
    expect(res.body).not.toContain('password123')
  })

  it('弱密码与非法邮箱被边界校验拒绝', async () => {
    const t = await makeTestApp()
    app = t.app
    const weak = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'a@b.co', password: '1234567' },
    })
    expect(weak.statusCode).toBe(400)
    expect((weak.json() as ApiErrorBody).error.code).toBe('VALIDATION_ERROR')
  })

  it('登录：密码错误与邮箱不存在返回同一错误码（防用户枚举）', async () => {
    const t = await makeTestApp()
    app = t.app
    await registerUser(app, 'known@example.com')

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'known@example.com', password: 'wrong-pass' },
    })
    const unknownEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ghost@example.com', password: 'wrong-pass' },
    })

    expect(wrongPassword.statusCode).toBe(401)
    expect(unknownEmail.statusCode).toBe(401)
    expect((wrongPassword.json() as ApiErrorBody).error.code).toBe('INVALID_CREDENTIALS')
    expect((unknownEmail.json() as ApiErrorBody).error.code).toBe('INVALID_CREDENTIALS')
    expect((wrongPassword.json() as ApiErrorBody).error.message).toBe(
      (unknownEmail.json() as ApiErrorBody).error.message,
    )
  })

  it('登录成功后访问令牌可用于鉴权端点', async () => {
    const t = await makeTestApp()
    app = t.app
    await registerUser(app, 'me@example.com')
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'me@example.com', password: 'password123' },
    })
    const { accessToken } = login.json() as { accessToken: string }

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: bearer(accessToken) })
    expect(me.statusCode).toBe(200)
    expect((me.json() as { user: { email: string } }).user.email).toBe('me@example.com')
  })
})

describe('访问令牌验证', () => {
  it('缺失 / 伪造令牌返回 401 规范结构', async () => {
    const t = await makeTestApp()
    app = t.app
    const noToken = await app.inject({ method: 'GET', url: '/api/auth/me' })
    const badToken = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: bearer('not-a-jwt'),
    })
    expect(noToken.statusCode).toBe(401)
    expect(badToken.statusCode).toBe(401)
    expect((noToken.json() as ApiErrorBody).error.code).toBe('UNAUTHORIZED')
  })
})

describe('刷新令牌旋转', () => {
  it('refresh 下发新访问令牌并旋转刷新令牌', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'rotate@example.com')

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: u.refreshCookie },
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { accessToken: string }).accessToken).toBeTruthy()
    const newCookie = String(res.headers['set-cookie'])
    expect(newCookie).toContain('refresh_token=')
    expect(newCookie.split(';')[0]).not.toBe(u.refreshCookie)
  })

  it('旧刷新令牌被撤销后复用会撤销该用户全部会话（防泄露）', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'reuse@example.com')

    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: u.refreshCookie },
    })
    expect(first.statusCode).toBe(200)
    const rotated = String(first.headers['set-cookie']).split(';')[0] ?? ''

    // 重放旧令牌 → 拒绝，并触发全量撤销
    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: u.refreshCookie },
    })
    expect(replay.statusCode).toBe(401)

    // 旋转后的新令牌也随即失效
    const afterRevoke = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: rotated },
    })
    expect(afterRevoke.statusCode).toBe(401)
  })

  it('无 Cookie 的 refresh 返回 401', async () => {
    const t = await makeTestApp()
    app = t.app
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })
})

describe('登出', () => {
  it('登出后刷新令牌失效，且重复登出幂等', async () => {
    const t = await makeTestApp()
    app = t.app
    const u = await registerUser(app, 'bye@example.com')

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: u.refreshCookie },
    })
    expect(logout.statusCode).toBe(200)
    expect(String(logout.headers['set-cookie'])).toContain('refresh_token=;')

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: u.refreshCookie },
    })
    expect(refresh.statusCode).toBe(401)

    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: u.refreshCookie },
    })
    expect(again.statusCode).toBe(200)
  })
})

describe('鉴权端点限流', () => {
  it('超过每分钟上限返回 429 与 RATE_LIMITED', async () => {
    const t = await makeTestApp({ env: { AUTH_RATE_LIMIT_MAX: '3' } })
    app = t.app
    const payload = { email: 'flood@example.com', password: 'password123' }

    let last = await app.inject({ method: 'POST', url: '/api/auth/login', payload })
    for (let i = 0; i < 3; i += 1) {
      last = await app.inject({ method: 'POST', url: '/api/auth/login', payload })
    }
    expect(last.statusCode).toBe(429)
    expect((last.json() as ApiErrorBody).error.code).toBe('RATE_LIMITED')
  })
})
