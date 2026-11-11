import { useInterviewStore } from './interview'
import { useQuestionStore } from './question'
import { useSettingsStore } from './settings'

/**
 * 启动期预加载。
 *
 * 存储层改成 async 后，store 的 setup 不能再同步读盘；必须在 app.use(router)
 * 与 app.mount 之前 await 一次，保证首次导航看到的不是空列表 / 默认设置。
 * 三个 refresh 内部各自经 withStorageLock 排队，纯读操作并发安全。
 *
 * 插件组件若脱离启动流程单独使用 store，需自行 await store.refresh()。
 */
export async function initializeStores(): Promise<void> {
  await Promise.all([
    useInterviewStore().refresh(),
    useQuestionStore().refresh(),
    useSettingsStore().refresh(),
  ])
}
