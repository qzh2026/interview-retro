import { describe, expect, it, vi } from 'vitest'
import {
  createShutdown,
  type ShutdownLogger,
  type ShutdownTarget,
} from '../../server/lifecycle'

function makeLogger(): ShutdownLogger {
  return { info: vi.fn(), error: vi.fn() }
}

function makeTargets() {
  const order: string[] = []
  const app: ShutdownTarget = {
    close: vi.fn(async () => {
      order.push('app')
    }),
  }
  const database: ShutdownTarget = {
    close: vi.fn(async () => {
      order.push('db')
    }),
  }
  return { app, database, order }
}

describe('createShutdown 优雅停机', () => {
  it('先关 HTTP 再关数据库，最后以 0 退出', async () => {
    const { app, database, order } = makeTargets()
    const logger = makeLogger()
    const exit = vi.fn()
    const shutdown = createShutdown({ app, database, logger, exit, timeoutMs: 1000 })

    await shutdown('SIGTERM')

    expect(order).toEqual(['app', 'db'])
    expect(exit).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledWith(0)
    expect(logger.info).toHaveBeenCalledWith(
      { signal: 'SIGTERM' },
      'graceful shutdown started',
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('重复收到信号是幂等的', async () => {
    const { app, database } = makeTargets()
    const exit = vi.fn()
    const shutdown = createShutdown({ app, database, logger: makeLogger(), exit })

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')])

    expect(app.close).toHaveBeenCalledTimes(1)
    expect(database.close).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
  })

  it('关闭 HTTP 失败时仍尝试关库，并以 1 退出', async () => {
    const { database, order } = makeTargets()
    const app: ShutdownTarget = {
      close: vi.fn(async () => {
        throw new Error('close failed')
      }),
    }
    const logger = makeLogger()
    const exit = vi.fn()
    const shutdown = createShutdown({ app, database, logger, exit })

    await shutdown('SIGTERM')

    expect(database.close).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['db'])
    expect(exit).toHaveBeenCalledWith(1)
    expect(logger.error).toHaveBeenCalledWith(
      { signal: 'SIGTERM', error: 'close failed' },
      'graceful shutdown failed',
    )
  })

  it('关闭卡住时超时兜底强制退出', async () => {
    vi.useFakeTimers()
    try {
      const app: ShutdownTarget = {
        close: vi.fn(() => new Promise<void>(() => {})),
      }
      const { database } = makeTargets()
      const logger = makeLogger()
      const exit = vi.fn()
      const shutdown = createShutdown({
        app,
        database,
        logger,
        exit,
        timeoutMs: 50,
      })

      void shutdown('SIGTERM')
      await vi.advanceTimersByTimeAsync(60)

      expect(exit).toHaveBeenCalledWith(1)
      expect(logger.error).toHaveBeenCalledWith(
        { signal: 'SIGTERM', timeoutMs: 50 },
        'graceful shutdown timed out',
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
