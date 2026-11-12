import { describe, expect, it } from 'vitest'
import { parseTaizhangMd } from '../src/plugins/taizhang-importer'

// 取自真实「面试出题台账.md」格式的精简样例：第 1 题已答已评，第 2 题已出待答
const TAIZHANG = `# 面试出题台账

## 题目档案

### 第 1 题（2026-11-10）

1. **日期与题号**：2026-11-10 · 第 1 题
2. **主题分类与难度**：项目与行为面 — 项目介绍与细节深挖 ｜ 中等偏上
3. **题面**：我们团队在给企业客户做大模型应用交付，请你完整介绍一个你主导的大模型应用项目：业务背景、你负责什么、技术怎么做、落地效果。
4. **考点**：项目叙事结构（背景-职责-方案-效果 / STAR）；技术架构表达与选型理由；AI 编程工具工程化；难点定位与解决过程；量化结果与业务价值
5. **采分点**（逐条满分与实得）：① 叙事结构完整 ｜ 满分 2｜实得 1
6. **我的回答摘要**：介绍了「工作台」项目，本人全面负责开发，用 AI 工具构建框架，人工把关采用体验测试。未提供落地效果与量化数据。
7. **得分**：3.5/10，与参考答案核心要点吻合度 40%
8. **缺失点**：
   - **落地效果与量化数字（最大硬伤）**：正确思路是项目叙事必须以可验证结果收尾。
   - **难点与解决过程缺失**：正确思路是准备一个「卡点故事」。
9. **表达问题**：
   - 缺「一句话开场定位」。
   - 「零构架」应为「零构建」，术语口误。
10. **出题动机**：项目面是技术岗开场必考，核心验证点是 AI 工具是否真的进了工程流程。
11. **解析（踩全点示范答法）**：
    > 以「企业内部知识库问答系统」为例。开场定位：我介绍一个企业内部知识库问答项目，负责检索与 Agent 编排，上线 3 个月日均调用 X 次，采纳率 62% 提到 89%。
12. **追问记录**：2026-11-11 发起追问 1 次，用户回应要点：DSH 负责底层框架，WorkBuddy 做界面。
13. **状态**：已答已评
14. **复习标记**：重点复习 ｜ 建议 2026-11-14（3 天后）复习

### 第 2 题（2026-11-11）

1. **日期与题号**：2026-11-11 · 第 2 题
2. **主题分类与难度**：RAG 与检索质量 — 检索质量归因与优化 ｜ 中等偏上
3. **题面**：我们给一家制造业客户交付了制度与工艺文档智能问答系统，上线后业务方反馈两类问题，请回答如何系统性定位并优化。
4. **考点**：检索失败分层归因；混合召回；rerank；RAG 评测
5~12. **（待作答后补全）**
13. **状态**：已出待答（2026-11-11 出题，2026-11-12 第 2 次补出）
14. **复习标记**：待评

## 待问题池

- 第 2 题 未作答
`

describe('parseTaizhangMd', () => {
  it('只导入已答已评的题，跳过已出待答', () => {
    const result = parseTaizhangMd(TAIZHANG)
    expect(result).toHaveLength(1)
    expect(result[0].content).toContain('大模型应用交付')
  })

  it('字段映射正确', () => {
    const [q] = parseTaizhangMd(TAIZHANG)
    expect(q.category).toBe('project')
    expect(q.difficulty).toBe(4) // 中等偏上
    expect(q.myAnswer).toContain('工作台')
    expect(q.idealAnswer).toContain('企业内部知识库问答')
    expect(q.selfRating).toBe(2) // 3.5/10 → 约 2 分
    expect(q.mastery).toBe('learning') // 重点复习 → learning
  })

  it('考点拆成标签，并把主题也作为标签', () => {
    const [q] = parseTaizhangMd(TAIZHANG)
    expect(q.tags).toContain('项目叙事结构（背景-职责-方案-效果 / STAR）')
    expect(q.tags).toContain('项目与行为面')
  })

  it('缺失点与表达问题合并进 lesson', () => {
    const [q] = parseTaizhangMd(TAIZHANG)
    expect(q.lesson).toContain('缺失点')
    expect(q.lesson).toContain('落地效果与量化数字')
    expect(q.lesson).toContain('表达问题')
    expect(q.lesson).toContain('零构架')
  })

  it('生成稳定 taizhangId 并保留原始字段到 metadata', () => {
    const [q] = parseTaizhangMd(TAIZHANG)
    expect(q.metadata?.taizhangId).toBe('taizhang:2026-11-10:第1题')
    const t = q.metadata?.taizhang as Record<string, unknown> | undefined
    expect(t?.date).toBe('2026-11-10')
    expect(t?.status).toBe('已答已评')
    expect(t?.score).toContain('3.5/10')
  })

  it('没有「题目档案」时返回空数组', () => {
    expect(parseTaizhangMd('# 别的文件\n没有题目')).toEqual([])
  })

  it('全是待答题时返回空数组', () => {
    const onlyPending = TAIZHANG.replace('13. **状态**：已答已评', '13. **状态**：已出待答')
    expect(parseTaizhangMd(onlyPending)).toHaveLength(0)
  })
})
