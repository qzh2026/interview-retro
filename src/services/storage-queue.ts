/**
 * 存储层串行写队列。
 *
 * 同步版本靠 JS 单线程天然保证「读状态 → 改集合 → 写回」的原子性；
 * 切成 async 之后，两次快速操作会交错成 read(A) → read(B) → write(A) → write(B)，
 * 后一次读到的是旧快照，前一次写入直接丢失。所有复合读写必须经这里排队。
 *
 * 约束：
 * - 锁只加在复合操作层（repository / settings / backup），底层 loadState / saveState 不加锁；
 * - **不可嵌套**：task 内部再调 withStorageLock 会等待自己，形成死锁。
 *   需要多步写入时，把多步放进同一个 task，或依次调用已各自加锁的仓储方法。
 */
let tail: Promise<unknown> = Promise.resolve()

export function withStorageLock<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(() => task())
  // 错误要传给调用方，但不能污染队列：后续任务仍必须继续执行
  tail = run.catch(() => undefined)
  return run
}
