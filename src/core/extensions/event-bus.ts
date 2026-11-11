import type { AppEvents, EventBus, EventHandler } from '@/sdk/types'

type AnyHandler = (payload: unknown) => void
type AnyObserver = (event: string, payload: unknown) => void

/** 类型安全的进程内事件总线；单个处理器抛错不会阻断其他插件 */
export function createEventBus(): EventBus {
  const channels = new Map<string, Set<AnyHandler>>()
  const observers = new Set<AnyObserver>()

  const bus: EventBus = {
    on(event, handler) {
      const key = String(event)
      const set = channels.get(key) ?? new Set<AnyHandler>()
      set.add(handler as unknown as AnyHandler)
      channels.set(key, set)
      return () => bus.off(event, handler)
    },

    off(event, handler) {
      channels.get(String(event))?.delete(handler as unknown as AnyHandler)
    },

    once<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>) {
      const off = bus.on(event, (payload) => {
        off()
        handler(payload)
      })
      return off
    },

    emit(event, ...args) {
      const payload = (args as unknown[])[0]
      channels.get(String(event))?.forEach((fn) => {
        try {
          fn(payload)
        } catch (err) {
          console.error(`[events] ${String(event)} 处理器异常`, err)
        }
      })
      observers.forEach((fn) => {
        try {
          fn(String(event), payload)
        } catch (err) {
          console.error('[events] onAny 处理器异常', err)
        }
      })
    },

    onAny(handler) {
      observers.add(handler)
      return () => {
        observers.delete(handler)
      }
    },
  }

  return bus
}
