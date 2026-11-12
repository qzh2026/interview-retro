import { definePlugin } from '@/sdk'
import type { Difficulty, MasteryLevel, QuestionCategory, QuestionInput, SelfRating } from '@/sdk'

/**
 * 面试出题台账（本项目的外部每日面试题落盘）导入器。
 *
 * 解析 `面试出题台账.md` 的「题目档案」小节：每题 14 个字段。
 * 只导入状态为「已答已评」的题（待答题不含答案/解析，落进题目复盘没意义），
 * 并为每题生成稳定 taizhangId（日期+题号），供「导入格式」通道做去重，
 * 支持台账每天增长后反复增量导入而不产生重复。
 *
 * 约束：QuestionInput 不允许带 reviewCount/lastReviewedAt/nextReviewAt，
 * 导入后复习排期会重置成「新题 / 明天首复习」；原始复习日期与建议复习日均存入
 * metadata.taizhang 备查，不丢信息。
 */

interface TaizhangBlock {
  num: string
  date: string
  theme: string
  subTheme: string
  difficultyRaw: string
  content: string
  points: string
  myAnswer: string
  scoreRaw: string
  missing: string
  expression: string
  motivation: string
  analysis: string
  followup: string
  status: string
  reviewMark: string
}

/** 提取第 n 个带粗体标签的字段；内容可跨多行，直到下一个「数字. **」或章节标题或文末 */
function field(block: string, n: number): string | null {
  const re = new RegExp(
    `(?:^|\\n)\\s*${n}\\.\\s*\\*\\*[^*]+?\\*\\*：([\\s\\S]*?)(?=\\n\\s*\\d+\\.\\s*\\*\\*|\\n#{2,3}\\s|$)`,
    '',
  )
  const m = block.match(re)
  return m ? m[1].trim() : null
}

function parseBlock(block: string, header: { num: string; date: string }): TaizhangBlock | null {
  const themeRaw = field(block, 2) ?? ''
  const [themePart, diffPart] = themeRaw.split(/[｜|]/)
  const theme = (themePart ?? '').split('—')[0].trim()
  const subTheme = (themePart ?? '').split('—')[1]?.trim() ?? ''
  return {
    num: `第${header.num}题`,
    date: header.date,
    theme,
    subTheme,
    difficultyRaw: (diffPart ?? '').trim(),
    content: field(block, 3) ?? '',
    points: field(block, 4) ?? '',
    myAnswer: field(block, 6) ?? '',
    scoreRaw: field(block, 7) ?? '',
    missing: field(block, 8) ?? '',
    expression: field(block, 9) ?? '',
    motivation: field(block, 10) ?? '',
    analysis: field(block, 11) ?? '',
    followup: field(block, 12) ?? '',
    status: field(block, 13) ?? '',
    reviewMark: field(block, 14) ?? '',
  }
}

function mapCategory(theme: string): QuestionCategory {
  if (theme.includes('项目')) return 'project'
  if (theme.includes('行为') || theme.includes('软技能')) return 'behavior'
  if (theme.includes('设计') || theme.includes('场景')) return 'design'
  if (theme.includes('hr') || theme.includes('HR')) return 'hr'
  if (
    theme.includes('RAG') ||
    theme.includes('Agent') ||
    theme.includes('后端') ||
    theme.includes('工程') ||
    theme.includes('模型') ||
    theme.includes('算法') ||
    theme.includes('技术') ||
    theme.includes('检索')
  ) {
    return 'tech'
  }
  return 'other'
}

function mapDifficulty(raw: string): Difficulty {
  if (raw.includes('很简单') || raw.includes('简单')) return 2
  if (raw.includes('中等偏下')) return 3
  if (raw.includes('中等偏上')) return 4
  if (raw.includes('偏难') || raw.includes('难')) return 5
  if (raw.includes('中等')) return 3
  return 3
}

function mapScore(raw: string | null): SelfRating {
  if (!raw) return 3
  const m = raw.match(/([\d.]+)\s*\/\s*10/)
  if (!m) return 3
  const score = parseFloat(m[1])
  const rating = Math.round(score / 2)
  return Math.max(1, Math.min(5, rating)) as SelfRating
}

function mapMastery(raw: string | null): MasteryLevel {
  if (!raw) return 'unknown'
  if (raw.includes('已掌握')) return 'mastered'
  if (raw.includes('需巩固') || raw.includes('重点复习')) return 'learning'
  return 'unknown'
}

function toTags(points: string | null, theme: string): string[] {
  const tags = (points ?? '')
    .split(/[；;、，,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
  const t = theme.trim()
  if (t && !tags.includes(t)) tags.push(t)
  return tags.slice(0, 8)
}

function toQuestionInput(b: TaizhangBlock): QuestionInput {
  const taizhangId = `taizhang:${b.date}:${b.num}`
  const lessonParts = [b.missing && `缺失点：${b.missing}`, b.expression && `表达问题：${b.expression}`]
    .filter(Boolean)
    .join('\n\n')
  return {
    interviewId: null,
    content: b.content,
    category: mapCategory(b.theme),
    tags: toTags(b.points, b.theme),
    difficulty: mapDifficulty(b.difficultyRaw),
    myAnswer: b.myAnswer,
    idealAnswer: b.analysis,
    lesson: lessonParts,
    selfRating: mapScore(b.scoreRaw),
    mastery: mapMastery(b.reviewMark),
    metadata: {
      taizhangId,
      taizhang: {
        date: b.date,
        num: b.num,
        theme: b.theme,
        subTheme: b.subTheme,
        difficulty: b.difficultyRaw,
        points: b.points,
        score: b.scoreRaw,
        status: b.status,
        reviewMark: b.reviewMark,
        motivation: b.motivation,
        followup: b.followup,
      },
    },
  }
}

export function parseTaizhangMd(text: string): QuestionInput[] {
  const sectionStart = text.indexOf('## 题目档案')
  const body = sectionStart >= 0 ? text.slice(sectionStart) : text
  const headerRe = /###\s*第\s*(\d+)\s*题（(\d{4}-\d{2}-\d{2})）/g
  const headers: { index: number; num: string; date: string }[] = []
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(body))) {
    headers.push({ index: m.index, num: m[1], date: m[2] })
  }
  if (headers.length === 0) return []
  const blocks: string[] = []
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index
    const end = i + 1 < headers.length ? headers[i + 1].index : body.length
    blocks.push(body.slice(start, end))
  }
  return blocks
    .map((blk, i) => parseBlock(blk, { num: headers[i].num, date: headers[i].date }))
    .filter((b): b is TaizhangBlock => b !== null && b.content.length > 0)
    .filter((b) => b.status.includes('已答已评'))
    .map(toQuestionInput)
}

export default definePlugin({
  manifest: {
    id: 'builtin:taizhang-import',
    name: '面试出题台账导入',
    version: '1.0.0',
    description: '解析「面试出题台账.md」：只导入已答已评的题，按日期+题号去重，落盘进题目复盘',
    contributes: ['importer'],
  },
  setup({ registerImporter }) {
    registerImporter({
      id: 'taizhang-md',
      label: '面试出题台账 (.md)',
      accept: '.md',
      description: '只导入状态为「已答已评」的题；按日期+题号去重，重复导入不增量',
      parse(text) {
        return { questions: parseTaizhangMd(text) }
      },
    })
  },
})
