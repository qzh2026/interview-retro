import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../server/app'
import { loadConfig } from '../../server/config/env'
import { createHealthService } from '../../server/modules/health/service'
import type { HealthRepository } from '../../server/modules/health/repository'
import type { HealthService } from '../../server/modules/health/service'
import type { ApiErrorBody } from '../../shared/api'

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' })
const allowedOrigin = 'http://localhost:5173'

function repoReturning(value: boolean | Promise<boolean>): HealthRepository {
  return { probe: () => Promise.resolve(value) }
}

async function makeApp(repo: HealthRepository): Promise<FastifyInstance> {
  return buildApp(config, { healthService: createHealthService(repo, 'test-version') })
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('health 端点', () => {
  it('/health 返回存活信息并带上安全头与 requestId', async () => {
    app = await makeApp(repoReturning(true))
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ok', version: 'test-version' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
    expect(res.headers['x-request-id']).toBeTruthy()
    // 测试环境不下发 HSTS
    expect(res.headers['strict-transport-security']).toBeUndefined()
  })

  it('/ready 数据库就绪时返回 200', async () => {
    app = await makeApp(repoReturning(true))
    const res = await app.inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'ready', database: 'ok' })
  })

  it('/ready 迁移未应用时返回 503 与规范化错误结构', async () => {
    app = await makeApp(repoReturning(false))
    const res = await app.inject({ method: 'GET', url: '/ready' })
    const body = res.json() as ApiErrorBody

    expect(res.statusCode).toBe(503)
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE')
    expect(body.error.requestId).toBe(res.headers['x-request-id'])
    expect(res.body).not.toContain('stack')
  })

  it('仓储抛驱动异常时也不把内部细节返回给客户端', async () => {
    const repo: HealthRepository = {
      async probe() {
        throw new Error('libSQL internal: secret connection string')
      },
    }
    app = await makeApp(repo)
    const res = await app.inject({ method: 'GET', url: '/ready' })

    expect(res.statusCode).toBe(503)
    expect(res.body).not.toContain('secret connection string')
    expect((res.json() as ApiErrorBody).error.code).toBe('SERVICE_UNAVAILABLE')
  })

  it('未知路径返回统一的 404 结构', async () => {
    app = await makeApp(repoReturning(true))
    const res = await app.inject({ method: 'GET', url: '/no-such-route' })
    expect(res.statusCode).toBe(404)
    expect((res.json() as ApiErrorBody).error.code).toBe('NOT_FOUND')
  })

  it('未知异常不外泄堆栈，统一映射为 INTERNAL', async () => {
    const brokenService: HealthService = {
      liveness() {
        throw new Error('secret internal detail')
      },
      async readiness() {
        return { status: 'ready', database: 'ok', timestamp: new Date().toISOString() }
      },
    }
    app = await buildApp(config, { healthService: brokenService })
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(500)
    expect(res.body).not.toContain('secret internal detail')
    expect((res.json() as ApiErrorBody).error.code).toBe('INTERNAL')
  })
})

describe('CORS 显式白名单', () => {
  it('白名单来源的预检请求被允许', async () => {
    app = await makeApp(repoReturning(true))
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: allowedOrigin, 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin)
  })

  it('白名单外的来源不下发允许头', async () => {
    app = await makeApp(repoReturning(true))
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://not-allowed.example' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
