/**
 * 领域类型入口（兼容层）
 *
 * 真正的定义已抽到 `shared/domain.ts`，供前端与后端共享。
 * 这里保留 `@/types` 这个 import 路径，既有代码、SDK 对外签名与第三方插件全部不用改。
 * 新增领域类型请改 `shared/domain.ts`，不要在本文件另写一份。
 */
export * from '../../shared/domain'
