/** 优雅停机的可测试抽象：Windows 上无法用 SIGTERM 可靠实测，靠单测保证行为 */
export interface ShutdownTarget {
  close(): Promise<void>
}

export interface ShutdownLogger {
  info(payload: Record<string, unknown>, message: string): void
  error(payload: Record<string, unknown>, message: string): void
}

export interface ShutdownOptions {
  app: ShutdownTarget
  database: ShutdownTarget
  logger: ShutdownLogger
  timeoutMs?: number
  /** 注入以拦截进程退出，生产默认 process.exit */
  exit?: (code: number) => void
}

export type ShutdownHandler = (signal: string) => Promise<void>

/**
 * 关闭顺序：先停 HTTP（不再接新请求）→ 再关数据库 → 退出。
 * 两次 close 都会尝试执行，避免前者失败时把数据库连接漏掉；
 * 重复收到信号是幂等的；超时兜底强制退出，防止连接卡死导致永不退出。
 */
export function createShutdown(options: ShutdownOptions): ShutdownHandler {
  const { app, database, logger } = options
  const timeoutMs = options.timeoutMs ?? 10_000
  const exit = options.exit ?? ((code: number) => process.exit(code))
  let started = false
  let timedOut = false

  return async (signal: string): Promise<void> => {
    if (started) return
    started = true
    logger.info({ signal }, 'graceful shutdown started')

    const timer = setTimeout(() => {
      timedOut = true
      logger.error({ signal, timeoutMs }, 'graceful shutdown timed out')
      exit(1)
    }, timeoutMs)
    timer.unref()

    let failure: unknown
    try {
      await app.close()
    } catch (err) {
      failure = err
    }
    try {
      await database.close()
    } catch (err) {
      failure ??= err
    }
    clearTimeout(timer)
    if (timedOut) return

    if (failure) {
      logger.error(
        { signal, error: failure instanceof Error ? failure.message : String(failure) },
        'graceful shutdown failed',
      )
      exit(1)
      return
    }

    logger.info({ signal }, 'graceful shutdown complete')
    exit(0)
  }
}
