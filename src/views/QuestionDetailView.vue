<template>
    <div class="page">
      <div class="page-header">
      <div>
        <h1>单题复盘</h1>
        <p>「当时怎么答的」和「应该怎么答」分开看，差距才是提分点</p>
      </div>
      <div class="header-actions">
        <el-button @click="$router.back()">返回</el-button>
        <el-popconfirm title="确定删除这道题？不可恢复" @confirm="onDelete">
          <template #reference><el-button type="danger" plain>删除</el-button></template>
        </el-popconfirm>
        <el-button v-if="isAiEnabled()" :loading="aiLoading" :disabled="aiLoading" @click="onAiReview">
          AI 复盘
        </el-button>
        <el-button v-if="aiLoading" @click="onAiCancel">取消</el-button>
        <el-button type="primary" :disabled="aiLoading" @click="onSave">保存修改</el-button>
      </div>
    </div>

    <el-empty v-if="!question" description="这道题可能已被删除" />

    <template v-else>
      <section class="card mb-16">
        <h2
          class="section-title panel-title"
          role="button"
          tabindex="0"
          @click="openPanel('content')"
          @keydown.enter="openPanel('content')"
          @keydown.space.prevent="openPanel('content')"
        >
          <span>题目</span>
          <span class="panel-hint">放大</span>
        </h2>
        <el-input v-model="draft.content" type="textarea" :rows="2" />
        <div class="form-row mt-16">
          <el-form-item label="分类">
            <el-select v-model="draft.category" style="width: 100%">
              <el-option
                v-for="o in CATEGORY_OPTIONS"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="难度">
            <el-select v-model="draft.difficulty" style="width: 100%">
              <el-option
                v-for="o in DIFFICULTY_OPTIONS"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="自评">
            <el-select v-model="draft.selfRating" style="width: 100%">
              <el-option
                v-for="o in RATING_OPTIONS"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="掌握度">
            <el-select v-model="draft.mastery" style="width: 100%">
              <el-option
                v-for="o in MASTERY_OPTIONS"
                :key="o.value"
                :label="o.label"
                :value="o.value"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="知识点标签">
          <el-select
            v-model="draft.tags"
            multiple
            filterable
            allow-create
            default-first-option
            style="width: 100%"
          >
            <el-option v-for="tag in draft.tags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
      </section>

      <div class="compare-grid mb-16">
        <section class="card">
          <h2
            class="section-title panel-title"
            role="button"
            tabindex="0"
            @click="openPanel('myAnswer')"
            @keydown.enter="openPanel('myAnswer')"
            @keydown.space.prevent="openPanel('myAnswer')"
          >
            <span>我当时怎么答的</span>
            <span class="panel-hint">放大</span>
          </h2>
          <el-input v-model="draft.myAnswer" type="textarea" :rows="7" placeholder="原样记录" />
        </section>
        <section class="card">
          <h2
            class="section-title panel-title"
            role="button"
            tabindex="0"
            @click="openPanel('idealAnswer')"
            @keydown.enter="openPanel('idealAnswer')"
            @keydown.space.prevent="openPanel('idealAnswer')"
          >
            <span>复盘后的正确思路</span>
            <span class="panel-hint">放大</span>
          </h2>
          <el-input
            v-model="draft.idealAnswer"
            type="textarea"
            :rows="7"
            placeholder="查资料后整理"
          />
        </section>
      </div>

      <section class="card mb-16">
        <h2
          class="section-title panel-title"
          role="button"
          tabindex="0"
          @click="openPanel('lesson')"
          @keydown.enter="openPanel('lesson')"
          @keydown.space.prevent="openPanel('lesson')"
        >
          <span>踩坑点 · 下次怎么说</span>
          <span class="panel-hint">放大</span>
        </h2>
        <el-input v-model="draft.lesson" type="textarea" :rows="3" />
      </section>

      <section class="card review-panel">
        <div>
          <strong
            class="panel-title panel-title--inline"
            role="button"
            tabindex="0"
            @click="openPanel('review')"
            @keydown.enter="openPanel('review')"
            @keydown.space.prevent="openPanel('review')"
          >
            复习打卡
            <span class="panel-hint">放大</span>
          </strong>
          <div class="muted">
            已复习 {{ question.reviewCount }} 次 · 下次 {{ question.nextReviewAt || '—' }}
            <span v-if="question.lastReviewedAt">
              · 上次 {{ formatDateTime(question.lastReviewedAt) }}</span
            >
          </div>
        </div>
        <div class="review-actions">
          <el-button @click="onReviewed(false)">没记住，明天再来</el-button>
          <el-button type="primary" @click="onReviewed(true)">记住了，拉长间隔</el-button>
        </div>
      </section>

      <!-- questionDetailTab 扩展点：插件注册的单题附加面板 -->
      <section v-if="tabs.length > 0" class="card mt-16">
        <h2 class="section-title">扩展面板</h2>
        <el-tabs>
          <el-tab-pane v-for="tab in tabs" :key="tab.id" :label="tab.label">
            <PluginBoundary
              :label="tab.label"
              :component="tab.component"
              :component-props="{ question }"
            />
          </el-tab-pane>
        </el-tabs>
      </section>
    </template>

    <!-- 模块放大弹层：点击标题弹出居中大卡片，遮罩 / 关闭 / ESC 收回 -->
    <div v-if="panel" class="zoom-overlay" @click.self="closePanel">
      <section
        class="zoom-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`放大查看：${panel.title}`"
      >
        <header class="zoom-head">
          <div>
            <div class="zoom-kicker">放大查看</div>
            <h2 class="zoom-title">{{ panel.title }}</h2>
          </div>
          <el-button @click="closePanel">关闭</el-button>
        </header>

        <div class="zoom-body">
          <template v-if="panel.kind === 'question'">
            <el-input v-model="draft.content" type="textarea" :rows="10" class="zoom-input" />
            <div class="form-row mt-16">
              <el-form-item label="分类">
                <el-select v-model="draft.category" style="width: 100%">
                  <el-option v-for="o in CATEGORY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="难度">
                <el-select v-model="draft.difficulty" style="width: 100%">
                  <el-option v-for="o in DIFFICULTY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="自评">
                <el-select v-model="draft.selfRating" style="width: 100%">
                  <el-option v-for="o in RATING_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="掌握度">
                <el-select v-model="draft.mastery" style="width: 100%">
                  <el-option v-for="o in MASTERY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
            </div>
            <el-form-item label="知识点标签" class="mt-16">
              <el-select
                v-model="draft.tags"
                multiple
                filterable
                allow-create
                default-first-option
                style="width: 100%"
              >
                <el-option v-for="tag in draft.tags" :key="tag" :label="tag" :value="tag" />
              </el-select>
            </el-form-item>
          </template>

          <el-input
            v-else-if="activePanel === 'myAnswer'"
            v-model="draft.myAnswer"
            type="textarea"
            :rows="20"
            placeholder="原样记录"
            class="zoom-input"
          />
          <el-input
            v-else-if="activePanel === 'idealAnswer'"
            v-model="draft.idealAnswer"
            type="textarea"
            :rows="20"
            placeholder="查资料后整理"
            class="zoom-input"
          />
          <el-input
            v-else-if="activePanel === 'lesson'"
            v-model="draft.lesson"
            type="textarea"
            :rows="14"
            class="zoom-input"
          />

          <template v-else>
            <div class="zoom-review">
              <div class="zoom-review-stat">
                已复习 <strong>{{ question?.reviewCount ?? 0 }}</strong> 次
              </div>
              <div class="muted">下次 {{ question?.nextReviewAt || '—' }}</div>
              <div v-if="question?.lastReviewedAt" class="muted">
                上次 {{ formatDateTime(question.lastReviewedAt) }}
              </div>
            </div>
            <div class="zoom-review-actions">
              <el-button @click="onReviewed(false)">没记住，明天再来</el-button>
              <el-button type="primary" @click="onReviewed(true)">记住了，拉长间隔</el-button>
            </div>
          </template>
        </div>

        <footer class="zoom-foot">编辑内容会同步回主页面，点顶部「保存修改」后生效</footer>
      </section>
    </div>

    <!-- AI 复盘结果面板：完整展示本次生成内容，用户逐条决定是否填入草稿 -->
    <div v-if="aiResult" class="zoom-overlay ai-overlay" @click.self="closeAiResult">
      <section class="zoom-modal" role="dialog" aria-modal="true" aria-label="AI 复盘结果">
        <header class="zoom-head">
          <div>
            <div class="zoom-kicker">AI 复盘结果</div>
            <h2 class="zoom-title">本次生成内容</h2>
          </div>
          <el-button @click="closeAiResult">关闭</el-button>
        </header>

        <div class="zoom-body ai-body">
          <section v-for="section in aiSections" :key="section.target" class="ai-section">
            <div class="ai-section-head">
              <h3 class="ai-section-title">{{ section.title }}</h3>
              <span class="ai-badge" :class="`ai-badge--${autoFillTone(section.target)}`">
                {{ autoFillLabel(section.target) }}
              </span>
            </div>

            <p v-if="section.target === 'idealAnswer'" class="ai-text">{{ section.items[0] }}</p>
            <ol v-else-if="section.target === 'lesson'" class="ai-list">
              <li v-for="(item, index) in section.items" :key="index">{{ item }}</li>
            </ol>
            <div v-else class="ai-tags">
              <span v-for="(item, index) in section.items" :key="index" class="ai-tag">
                {{ item }}
              </span>
            </div>

            <div class="ai-section-foot">
              <el-button
                v-if="section.target !== 'tags'"
                size="small"
                :disabled="isApplied(section)"
                @click="adoptSection(section)"
              >
                {{ adoptLabel(section) }}
              </el-button>
              <span v-else class="muted">调用时已自动合并进「知识点标签」</span>
            </div>
          </section>
          <el-empty v-if="aiSections.length === 0" description="本次 AI 没有生成可用内容" />
        </div>

        <footer class="zoom-foot">
          点「填入草稿 / 覆盖草稿」会写入对应文本框；所有改动仍需点顶部「保存修改」才落库。
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getQuestionDetailTabs } from '@/core/extensions/registry'
import { useQuestionStore } from '@/stores/question'
import { CATEGORY_OPTIONS, DIFFICULTY_OPTIONS, MASTERY_OPTIONS, RATING_OPTIONS } from '@/constants'
import { formatDateTime } from '@/utils/date'
import PluginBoundary from '@/components/common/PluginBoundary.vue'
import type { Difficulty, MasteryLevel, QuestionCategory, SelfRating } from '@/types'
import { CLOUD_UNREACHABLE_HINT, isBackendUnreachable, toUserMessage } from '@/services/cloud/http'
import { isAiEnabled, reviewWithAi } from '@/services/ai'
import {
  buildAiDraftPatch,
  buildAiResultSections,
  type AiResultSection,
  type AiResultTarget,
} from '@/services/ai-review'
import { getQuestionPanel, type PanelId } from '@/utils/question-panels'
import type { AiReviewResponse } from '@/sdk/types'

const route = useRoute()
const router = useRouter()
const questionStore = useQuestionStore()
const id = computed(() => String(route.params.id ?? ''))
const question = computed(() => questionStore.getById(id.value))
const tabs = getQuestionDetailTabs()

const aiLoading = ref(false)
const aiAbort = ref<AbortController | null>(null)

/** 本次 AI 原始结果；非空时展示结果面板。与 draft 分开，保证「不覆盖」默认值仍成立 */
const aiResult = ref<AiReviewResponse | null>(null)
/** 自动回填命中了哪些字段，用于结果面板标注「已自动填入 / 已有内容未自动覆盖」 */
const aiAutoFilled = reactive({ idealAnswer: false, lesson: false })
const aiSections = computed(() =>
  aiResult.value ? buildAiResultSections(aiResult.value) : [],
)

function closeAiResult(): void {
  aiResult.value = null
}

// 同路由切换题目时组件会复用：清掉上一题的结果与进行中的请求，避免面板残留
watch(id, () => {
  aiAbort.value?.abort()
  aiLoading.value = false
  closeAiResult()
})

function autoFillLabel(target: AiResultTarget): string {
  if (target === 'tags') return '已自动合并'
  return aiAutoFilled[target] ? '已自动填入' : '已有内容，未自动覆盖'
}

function autoFillTone(target: AiResultTarget): 'success' | 'warning' | 'info' {
  if (target === 'tags') return 'info'
  return aiAutoFilled[target] ? 'success' : 'warning'
}

/** 当前放大的模块；null = 弹层未打开。弹层内控件与主页面共用同一个 draft */
const activePanel = ref<PanelId | null>(null)
const panel = computed(() => getQuestionPanel(activePanel.value))

function openPanel(id: PanelId): void {
  activePanel.value = id
}

function closePanel(): void {
  activePanel.value = null
}

// 任一弹层（放大 / AI 结果）打开时锁住背景滚动，关闭或离开页面后恢复
watch([activePanel, aiResult], ([panel, result]) => {
  document.body.style.overflow = panel || result ? 'hidden' : ''
})

function onEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  // AI 复盘进行中优先取消请求，避免误关面板打断用户
  if (aiLoading.value) {
    onAiCancel()
    return
  }
  if (aiResult.value) {
    closeAiResult()
    return
  }
  if (activePanel.value !== null) closePanel()
}

onMounted(() => window.addEventListener('keydown', onEscape))
onUnmounted(() => {
  window.removeEventListener('keydown', onEscape)
  document.body.style.overflow = ''
})

const draft = reactive({
  content: '',
  category: 'tech' as QuestionCategory,
  difficulty: 3 as Difficulty,
  selfRating: 3 as SelfRating,
  mastery: 'unknown' as MasteryLevel,
  tags: [] as string[],
  myAnswer: '',
  idealAnswer: '',
  lesson: '',
})

watch(
  question,
  (value) => {
    if (!value) return
    Object.assign(draft, {
      content: value.content,
      category: value.category,
      difficulty: value.difficulty,
      selfRating: value.selfRating,
      mastery: value.mastery,
      tags: [...value.tags],
      myAnswer: value.myAnswer,
      idealAnswer: value.idealAnswer,
      lesson: value.lesson,
    })
  },
  { immediate: true },
)

/** 面板里的采纳按钮：用户显式点击即允许覆盖已有内容，但改的仍是 draft，需「保存修改」才落库 */
function isApplied(section: AiResultSection): boolean {
  if (section.target === 'idealAnswer') return draft.idealAnswer === section.applyText
  if (section.target === 'lesson') return draft.lesson === section.applyText
  return false
}

function adoptLabel(section: AiResultSection): string {
  if (isApplied(section)) return '已填入草稿'
  const current = section.target === 'idealAnswer' ? draft.idealAnswer : draft.lesson
  return current.trim() ? '覆盖草稿' : '填入草稿'
}

function adoptSection(section: AiResultSection): void {
  if (section.target === 'idealAnswer') draft.idealAnswer = section.applyText
  else if (section.target === 'lesson') draft.lesson = section.applyText
  else return
  ElMessage.success('已写入草稿，请检查后点击「保存修改」')
}

async function onSave(): Promise<void> {
  if (!draft.content.trim()) {
    ElMessage.warning('题目内容不能为空')
    return
  }
  try {
    await questionStore.update(id.value, { ...draft, tags: [...draft.tags] })
    ElMessage.success('已保存')
  } catch (err) {
    ElMessage.error(toUserMessage(err))
  }
}

async function onAiReview(): Promise<void> {
  if (!question.value) return
  if (!draft.content.trim()) {
    ElMessage.warning('请先填写题目内容再使用 AI 复盘')
    return
  }
  aiAbort.value?.abort()
  const controller = new AbortController()
  aiAbort.value = controller
  aiLoading.value = true
  try {
    const res = await reviewWithAi(
      {
        content: draft.content,
        myAnswer: draft.myAnswer,
        category: draft.category,
        tags: [...draft.tags],
      },
      { signal: controller.signal },
    )
    if (controller.signal.aborted) return
    // 默认仍是「只填草稿、不覆盖用户已写内容」；需用户点「保存修改」才落库
    const patch = buildAiDraftPatch(res, {
      idealAnswer: draft.idealAnswer,
      lesson: draft.lesson,
      tags: [...draft.tags],
    })
    if (patch.idealAnswer !== undefined) draft.idealAnswer = patch.idealAnswer
    if (patch.lesson !== undefined) draft.lesson = patch.lesson
    draft.tags = patch.tags
    // 记录哪些字段被自动填入，结果面板据此标注「已自动填入 / 已有内容未自动覆盖」
    aiAutoFilled.idealAnswer = patch.idealAnswer !== undefined
    aiAutoFilled.lesson = patch.lesson !== undefined
    // 两个遮罩不叠加：先收起放大弹层，再展示完整 AI 结果供逐条采纳
    closePanel()
    aiResult.value = res
    ElMessage.success('AI 复盘完成：结果已展示，可逐条填入草稿')
  } catch (err) {
    if (controller.signal.aborted) return
    ElMessage.error(isBackendUnreachable(err) ? CLOUD_UNREACHABLE_HINT : toUserMessage(err))
  } finally {
    if (aiAbort.value === controller) aiAbort.value = null
    if (!controller.signal.aborted) aiLoading.value = false
  }
}

function onAiCancel(): void {
  aiAbort.value?.abort()
  aiLoading.value = false
}

async function onReviewed(remembered: boolean): Promise<void> {
  try {
    await questionStore.markReviewed(id.value, remembered)
    ElMessage.success(remembered ? '已记住，下次复习间隔拉长' : '已重置，明天再练一次')
  } catch (err) {
    ElMessage.error(toUserMessage(err))
  }
}

async function onDelete(): Promise<void> {
  try {
    await questionStore.remove(id.value)
    ElMessage.success('已删除')
    router.push('/questions')
  } catch (err) {
    ElMessage.error(toUserMessage(err))
  }
}
</script>

<style scoped>
/* 可放大的模块标题：保持原有层级语义，仅加轻微交互提示 */
.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.15s ease;
}
.panel-title:hover,
.panel-title:focus-visible {
  color: var(--primary);
}
.panel-title:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 4px;
}
.panel-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.panel-title:hover .panel-hint,
.panel-title:focus-visible .panel-hint {
  opacity: 1;
}
.panel-title--inline {
  display: inline-flex;
  width: auto;
  margin: 0;
}

/* 居中模态：遮罩盖住整页，放大卡片居中，一次专注一个模块 */
.zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgb(15 18 23 / 45%);
  animation: overlay-in 0.16s ease-out;
}
@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.zoom-modal {
  width: min(760px, 100%);
  max-height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgb(15 18 23 / 22%);
  overflow: hidden;
  animation: modal-in 0.2s ease-out;
}
@keyframes modal-in {
  from {
    transform: translateY(12px) scale(0.98);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
.zoom-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}
.zoom-kicker {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.zoom-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.zoom-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}
.zoom-body :deep(.zoom-input .el-textarea__inner) {
  font-size: 14px;
  line-height: 1.8;
  min-height: 220px;
}
.zoom-review {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}
.zoom-review-stat {
  font-size: 15px;
  margin-bottom: 6px;
}
.zoom-review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.zoom-foot {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}

/* AI 复盘结果面板：复用居中模态骨架，内部按段展示 + 逐条采纳 */
.ai-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-section {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
}
.ai-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.ai-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}
.ai-badge {
  font-size: 11px;
  line-height: 1.5;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.ai-badge--success {
  color: var(--success);
  border-color: var(--success);
}
.ai-badge--warning {
  color: var(--warning);
  border-color: var(--warning);
}
.ai-badge--info {
  color: var(--primary);
  border-color: var(--primary);
}
.ai-text,
.ai-list {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text);
  margin: 0;
}
.ai-text {
  white-space: pre-wrap;
}
.ai-list {
  padding-left: 20px;
}
.ai-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ai-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--primary-soft);
  color: var(--primary);
}
.ai-section-foot {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ai-section-foot .muted {
  font-size: 12px;
}

@media (max-width: 900px) {
  .zoom-overlay {
    padding: 12px;
  }
  .zoom-modal {
    max-height: 94vh;
  }
}

.header-actions {
  display: flex;
  gap: 10px;
}
.form-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.review-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.review-panel .muted {
  font-size: 12px;
  margin-top: 5px;
}
.review-actions {
  display: flex;
  gap: 10px;
}
@media (max-width: 900px) {
  .form-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .compare-grid {
    grid-template-columns: 1fr;
  }
}
</style>
