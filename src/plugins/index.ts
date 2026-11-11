import type { Plugin } from '@/sdk'
import cloudSync from './cloud-sync'
import cloudAi from './cloud-ai'
import markdownExporter from './markdown-exporter'
import textImporter from './text-importer'
import tagCloud from './tag-cloud'
import reviewLog from './review-log'

/**
 * 插件注册总入口 —— 使用者扩展项目时唯一需要改的文件。
 *
 * 启用自己的插件：
 *   import myPlugin from './my-plugin'
 *   export const plugins: Plugin[] = [..., myPlugin]
 *
 * 卸载某个内置插件：注释掉对应行，或在「数据与备份 → 扩展管理」里关闭（刷新后生效）。
 * 注册顺序有意义：替换型扩展点（存储 / AI / 复习策略）后注册者生效。
 */
export const plugins: Plugin[] = [
  cloudSync,
  cloudAi,
  markdownExporter,
  textImporter,
  tagCloud,
  reviewLog,
]
