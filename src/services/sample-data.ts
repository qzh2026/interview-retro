/**
 * 示例数据：给在线 Demo 与新用户一个「产品长什么样」的即时样本。
 *
 * 约定：
 * 1. 数据构造是纯函数（buildSampleBundle），灌入才碰 store，便于单测校验内容。
 * 2. 灌入走 stores 的 createMany（仓储 insertMany 一次写盘 + 复习计划初始化 + 事件派发），
 *    不绕开存储层；调用是**追加**语义，确认框由调用方负责。
 * 3. 面试日期相对「今天」生成，Demo 数据永远看起来是最近的。
 */
import { useInterviewStore } from '@/stores/interview'
import { useQuestionStore } from '@/stores/question'
import type { InterviewInput, QuestionInput } from '@/types'

export type SampleQuestion = Omit<QuestionInput, 'interviewId'>

export interface SampleBundle {
  interviews: { input: InterviewInput; questions: SampleQuestion[] }[]
  /** 允许脱离场次独立录入的题（刷面经时看到的） */
  standalone: SampleQuestion[]
}

function daysAgo(days: number, from: Date): string {
  const d = new Date(from.getTime() - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** 构造示例数据（纯函数；now 可注入以便测试） */
export function buildSampleBundle(now: Date = new Date()): SampleBundle {
  return {
    interviews: [
      {
        input: {
          company: '星海科技',
          position: '前端工程师',
          round: 'tech1',
          date: daysAgo(28, now),
          result: 'passed',
          source: '内推',
          overallNotes: '面试官很看重项目深挖，浏览器渲染与框架原理问得细。',
        },
        questions: [
          {
            content: '说说 JS 闭包是什么，实际项目里用过吗？',
            category: 'tech',
            tags: ['闭包', '作用域', 'JS 基础'],
            difficulty: 3,
            myAnswer: '当时只背了定义「函数记住并访问自己的外部变量」，被追问内存泄漏就卡住了。',
            idealAnswer:
              '从词法作用域引入：闭包 = 函数 + 其词法环境的组合。给项目例子（防抖里保存 timer、缓存计算结果），最后主动提释放手段（用完置 null、避免无意挂到全局）。',
            lesson: '别只背定义，面试官想听「用在哪、坑在哪」；内存回收要主动说。',
            selfRating: 3,
            mastery: 'learning',
          },
          {
            content: '从输入 URL 到页面显示，中间发生了什么？',
            category: 'tech',
            tags: ['浏览器', '网络', '渲染'],
            difficulty: 4,
            myAnswer: '说了 DNS → TCP → HTTP → 解析 → 渲染的主线，但缓存策略和关键渲染路径没提。',
            idealAnswer:
              '按层展开：DNS 解析 → TCP/TLS 连接 → HTTP 请求（协商缓存强缓存）→ 浏览器解析 HTML/CSS 构建 DOM/CSSOM → 合成渲染树 → 布局绘制合成。主动补「关键渲染路径」和「重排重绘」两个加分点。',
            lesson: '大题要搭骨架再填细节，先说分几段再展开；缓存策略是必加分项。',
            selfRating: 3,
            mastery: 'learning',
          },
          {
            content: 'Vue 的响应式原理是什么，Vue3 和 Vue2 有什么区别？',
            category: 'tech',
            tags: ['Vue', '原理', '框架'],
            difficulty: 4,
            myAnswer:
              'Vue2 Object.defineProperty、Vue3 Proxy 说对了，但依赖收集与触发更新的过程没讲清。',
            idealAnswer:
              '讲完整链路：getter 里 track 收集依赖 → setter 里 trigger 触发更新 → 组件 effect 重跑。对比 defineProperty（要递归劫持、监听不到新增/删除、数组要重写方法）与 Proxy（惰性代理、支持新增删除、可监听 Map/Set）。',
            lesson: '原理题要画出「收集—触发」闭环，只对名词会显得背题。',
            selfRating: 4,
            mastery: 'learning',
          },
        ],
      },
      {
        input: {
          company: '云途数据',
          position: '全栈工程师',
          round: 'tech2',
          date: daysAgo(10, now),
          result: 'pending',
          source: 'BOSS 直聘',
          overallNotes: '二面偏系统设计：缓存、幂等、短链都考了，节奏快。',
        },
        questions: [
          {
            content: '数据库索引怎么设计？联合索引的最左前缀原则是什么？',
            category: 'tech',
            tags: ['SQL', '索引', '数据库'],
            difficulty: 4,
            myAnswer: '说了 B+ 树和最左前缀，但没结合业务表举例如何定联合索引的字段顺序。',
            idealAnswer:
              '先讲为什么是 B+ 树（矮胖、范围查询友好），再讲联合索引按字段顺序匹配（a,b,c 可命中 a / a,b / a,b,c，跳过 a 只用 b,c 不命中）。最后落到实战：把选择性高、等值查询的字段放前面，结合 EXPLAIN 验证。',
            lesson: '索引题必须落到「你那张表怎么建」，纯理论答不出差异。',
            selfRating: 3,
            mastery: 'learning',
          },
          {
            content: '如何保证缓存与数据库的一致性？',
            category: 'design',
            tags: ['缓存', '一致性', '系统设计'],
            difficulty: 5,
            myAnswer: '只说了「先更新数据库再删缓存」，被追问延迟双删和并发读写时就乱了。',
            idealAnswer:
              '先给基调：缓存是旁路，数据库是唯一事实源。主流方案是 Cache Aside（先更库、再删缓存）；追问一致性再展开延迟双删、订阅 binlog（Canal）最终一致、以及「删失败重试 + 兜底过期」的组合拳。说明业务能不能接受短暂不一致才是选型关键。',
            lesson: '一致性题先谈业务容忍度再谈方案；「删」比「更」安全，要主动讲为什么。',
            selfRating: 2,
            mastery: 'unknown',
          },
          {
            content: '设计一个短链服务，说说你的思路。',
            category: 'design',
            tags: ['系统设计', '短链', '高并发'],
            difficulty: 4,
            myAnswer: '说了 302 跳转和发号器，但哈希冲突、过期策略、统计维度都没提。',
            idealAnswer:
              '按接口 → 存储 → 发号 → 跳转 → 扩展展开：生成（自增 ID + Base62 编码，冲突天然避免；或哈希 + 冲突探测）、存储（KV 为主，长短映射）、302 跳转（保留统计能力）、热点缓存、过期与回收、点击统计的异步落库。容量估算（QPS、行数）是加分项。',
            lesson: '系统设计要主动给「取舍」：为什么 302 不用 301、为什么发号不用纯随机哈希。',
            selfRating: 3,
            mastery: 'unknown',
          },
          {
            content: '项目里遇到最难的问题是什么，怎么解决的？',
            category: 'project',
            tags: ['项目', 'STAR', '行为'],
            difficulty: 3,
            myAnswer:
              '讲了一个 localStorage 写满的问题，但时间线混乱，量化结果只有一句「后来就好了」。',
            idealAnswer:
              '按 STAR 结构：Situation（5MB 上限、题量上万写失败）→ Task（保住用户数据）→ Action（损坏快照备份、迁 IndexedDB 适配器、写入告警）→ Result（写入失败率降为 0、恢复了 N 份数据）。结尾点出「从故障里沉淀了什么机制」。',
            lesson: '项目难点题要量化结果 + 沉淀机制，只讲故事显得没复盘。',
            selfRating: 3,
            mastery: 'learning',
          },
        ],
      },
      {
        input: {
          company: '远帆网络',
          position: '前端工程师',
          round: 'hr',
          date: daysAgo(42, now),
          result: 'failed',
          source: '官网',
          overallNotes: 'HR 面挂得可惜，离职原因没组织好语言，语气显得抱怨。',
        },
        questions: [
          {
            content: '为什么从上一家公司离职？',
            category: 'hr',
            tags: ['行为', '离职', '表达'],
            difficulty: 3,
            myAnswer: '说了加班多、成长慢，越说越负面，HR 后面明显冷淡了。',
            idealAnswer:
              '中性表达 + 前向动机：感谢前东家的成长（具体到某能力），离开是因为想往某个方向深耕（与应聘岗位对齐），不评价前东家是非。三句话收束：学到 X、想做 Y、贵司的 Z 让我觉得匹配。',
            lesson: '离职原因永远答「为什么奔向」而不是「为什么逃离」；负面评价是红线。',
            selfRating: 2,
            mastery: 'learning',
          },
          {
            content: '说说你的缺点是什么？',
            category: 'behavior',
            tags: ['行为', '自我认知'],
            difficulty: 3,
            myAnswer: '说「太追求完美」，HR 追问具体事例时没接住。',
            idealAnswer:
              '真实但不致命的缺点 + 正在改的具体动作。例如「公开表达容易紧张 → 组内分享刻意练习、每次复盘」。关键是给出「改」的证据，而不是包装缺点。',
            lesson: '缺点题考的是自我认知和行动力，套话一追就穿。',
            selfRating: 3,
            mastery: 'unknown',
          },
        ],
      },
    ],
    standalone: [
      {
        content: '手写一个带取消功能的 debounce。',
        category: 'tech',
        tags: ['手写', '防抖', 'JS 基础'],
        difficulty: 2,
        myAnswer: '写出了延时执行的基本版，取消方法（cancel）忘了返回。',
        idealAnswer:
          '闭包保存 timer；返回函数带 cancel（clearTimer 并置空）；进阶提 immediate（首次立即执行）和返回值透传。二十行内写完并主动说测试点：连续调用只执行最后一次、cancel 后不再触发。',
        lesson: '手写题要主动交代测试点；「带取消」是题目明示的需求，漏了就是审题不细。',
        selfRating: 3,
        mastery: 'learning',
      },
    ],
  }
}

/**
 * 把示例数据灌入应用（追加语义，不碰已有数据）。
 * 题目会挂到新建场次下（映射真实 id），独立题保持 interviewId = null。
 */
export async function loadSampleData(): Promise<{ interviews: number; questions: number }> {
  const bundle = buildSampleBundle()
  const interviewStore = useInterviewStore()
  const questionStore = useQuestionStore()

  const created = await interviewStore.createMany(bundle.interviews.map((item) => item.input))
  const questions: QuestionInput[] = bundle.interviews.flatMap((item, index) =>
    item.questions.map((q) => ({ ...q, interviewId: created[index].id })),
  )
  for (const q of bundle.standalone) questions.push({ ...q, interviewId: null })
  await questionStore.createMany(questions)

  return { interviews: created.length, questions: questions.length }
}
