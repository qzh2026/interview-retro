import {
  CATEGORY_OPTIONS,
  MASTERY_OPTIONS,
  RESULT_OPTIONS,
  ROUND_OPTIONS,
  definePlugin,
  labelOf,
} from '@/sdk'

/** 示例插件 A：注册一种导出格式 */
export default definePlugin({
  manifest: {
    id: 'builtin:markdown-export',
    name: 'Markdown 导出',
    version: '1.0.0',
    description: '把全部题目按分类导出成一份可直接放进笔记软件的 Markdown',
    contributes: ['exporter'],
  },

  setup({ registerExporter, log }) {
    registerExporter({
      id: 'markdown-notes',
      label: '导出为 Markdown',
      description: '按分类分组，含当时的回答、复盘答案与踩坑点',
      extension: 'md',
      run({ interviews, questions, today }) {
        const lines: string[] = [
          `# 面经复盘 · ${today}`,
          '',
          `> 共 ${interviews.length} 场面试，${questions.length} 道题`,
          '',
        ]

        for (const option of CATEGORY_OPTIONS) {
          const group = questions.filter((q) => q.category === option.value)
          if (group.length === 0) continue
          lines.push(`## ${option.label}`, '')
          group.forEach((q) => {
            lines.push(`### ${q.content.replace(/\s+/g, ' ')}`, '')
            lines.push(`- 标签：${q.tags.join('、') || '—'}`)
            lines.push(`- 自评：${q.selfRating} 分 · 掌握度：${labelOf(MASTERY_OPTIONS, q.mastery)}`)
            lines.push(`- 下次复习：${q.nextReviewAt ?? '—'}`, '')
            lines.push('**当时的回答**', '', q.myAnswer || '（未记录）', '')
            lines.push('**复盘后的正确思路**', '', q.idealAnswer || '（待补充）', '')
            if (q.lesson) lines.push('**踩坑点**', '', q.lesson, '')
            lines.push('---', '')
          })
        }

        if (interviews.length > 0) {
          lines.push('## 面试场次', '')
          interviews.forEach((item) => {
            const round = labelOf(ROUND_OPTIONS, item.round)
            const result = labelOf(RESULT_OPTIONS, item.result)
            lines.push(`- ${item.date} ${item.company} · ${item.position} · ${round} · ${result}`)
          })
          lines.push('')
        }

        return {
          filename: `面经复盘-${today}.md`,
          content: lines.join('\n'),
          mimeType: 'text/markdown;charset=utf-8',
        }
      },
    })
    log('Markdown 导出格式已注册')
  },
})
