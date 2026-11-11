import { definePlugin } from '@/sdk'
import type { QuestionInput } from '@/sdk'

/**
 * 示例插件 B：注册一种导入格式。
 * 返回 QuestionInput 即可，id / 时间戳 / 首次复习日期全部由核心补齐，
 * 插件完全不需要知道数据是怎么存的。
 */
export default definePlugin({
  manifest: {
    id: 'builtin:text-import',
    name: '纯文本批量导入',
    version: '1.0.0',
    description: '每行一道题，快速把面经文本变成待复盘题目',
    contributes: ['importer'],
  },

  setup({ registerImporter }) {
    registerImporter({
      id: 'txt-lines',
      label: '纯文本（每行一题）',
      accept: '.txt,.md',
      description: '忽略空行与 # 开头的注释行，导入后请逐题补回答与复盘',
      parse(text) {
        const questions: QuestionInput[] = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'))
          .map((content) => ({
            interviewId: null,
            content,
            category: 'tech' as const,
            tags: [],
            difficulty: 3 as const,
            myAnswer: '',
            idealAnswer: '',
            lesson: '',
            selfRating: 3 as const,
            mastery: 'unknown' as const,
          }))
        return { questions }
      },
    })
  },
})
