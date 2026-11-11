import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validate } from '../../server/core/validate'
import { loadConfig } from '../../server/config/env'
import { AppError, ConfigurationError } from '../../server/errors/app-error'

describe('loadConfig', () => {
  it('无环境变量时使用安全默认值', () => {
    const config = loadConfig({})
    expect(config.nodeEnv).toBe('development')
    expect(config.isProduction).toBe(false)
    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(3001)
    expect(config.logLevel).toBe('info')
    expect(config.databaseUrl).toBe('file:./server/data/interview-retro.db')
    expect(config.corsOrigins).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ])
  })

  it('CORS 来源去空白、去空项、去重', () => {
    const config = loadConfig({
      CORS_ORIGINS: ' https://a.example , ,https://b.example,https://a.example ',
    })
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example'])
  })

  it('非法端口快速失败', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow(ConfigurationError)
  })

  it('端口越界快速失败', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(ConfigurationError)
  })

  it('未知 NODE_ENV 快速失败', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigurationError)
  })

  it('生产环境禁止 CORS 通配符', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: '*' })).toThrow(
      /禁止 CORS 通配符/,
    )
  })

  it('CORS 来源不能全空', () => {
    expect(() => loadConfig({ CORS_ORIGINS: ' , , ' })).toThrow(
      /至少需要配置一个明确的来源/,
    )
  })
})

describe('validate 边界校验', () => {
  const schema = z.object({ count: z.coerce.number().int().min(1) })

  it('合法输入返回解析后的值', () => {
    expect(validate(schema, { count: '3' })).toEqual({ count: 3 })
  })

  it('非法输入抛 AppError，details 只含字段名与提示', () => {
    expect(() => validate(schema, { count: 'x' })).toThrow(AppError)
    try {
      validate(schema, { count: 'x' })
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      const appError = error as AppError
      expect(appError.statusCode).toBe(400)
      expect(appError.code).toBe('VALIDATION_ERROR')
      expect(appError.details).toBeInstanceOf(Array)
      expect(JSON.stringify(appError.details)).not.toContain('stack')
    }
  })
})
