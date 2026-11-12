<template>
    <div class="page" :class="{ 'page--zoomed': activePanel !== null }">
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

    <!-- 模块放大抽屉：右侧滑出，左页保持完整且可继续点其他标题切换 -->
    <aside v-if="panel" class="zoom-panel" :aria-label="`放大查看：${panel.title}`">
      <div class="zoom-head">
        <div>
          <div class="zoom-kicker">放大查看</div>
          <h2 class="zoom-title">{{ panel.title }}</h2>
        </div>
        <el-button @click="closePanel">收起</el-button>
      </div>

      <div class="zoom-switch">
        <button
          v-for="item in QUESTION_PANELS"
          :key="item.id"
          type="button"
          class="zoom-chip"
          :class="{ 'is-active': activePanel === item.id }"
          @click="openPanel(item.id)"
        >
          {{ item.title }}
        </button>
      </div>

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

      <div class="zoom-foot">编辑内容会同步回主页面，点顶部「保存修改」后生效</div>
    </aside>
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
import { buildAiDraftPatch } from '@/services/ai-review'
import {
  getQuestionPanel,
  QUESTION_PANELS,
  type PanelId,
} from '@/utils/question-panels'

const route = useRoute()
const router = useRouter()
const questionStore = useQuestionStore()
const id = computed(() => String(route.params.id ?? ''))
const question = computed(() => questionStore.getById(id.value))
const tabs = getQuestionDetailTabs()

const aiLoading = ref(false)
const aiAbort = ref<AbortController | null>(null)

/** 当前放大的模块；null = 未打开抽屉。抽屉内控件与主页面共用同一个 draft */
const activePanel = ref<PanelId | null>(null)
const panel = computed(() => getQuestionPanel(activePanel.value))

function openPanel(id: PanelId): void {
  activePanel.value = id
}

function closePanel(): void {
  activePanel.value = null
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activePanel.value !== null) {
    // AI 复盘进行中优先取消请求，避免误关抽屉打断用户
    if (aiLoading.value) onAiCancel()
    else closePanel()
  }
}

onMounted(() => window.addEventListener('keydown', onEscape))
onUnmounted(() => window.removeEventListener('keydown', onEscape))

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
    // 只填草稿、不覆盖用户已写内容；需用户点「保存修改」才落库
    const patch = buildAiDraftPatch(res, {
      idealAnswer: draft.idealAnswer,
      lesson: draft.lesson,
      tags: [...draft.tags],
    })
    if (patch.idealAnswer !== undefined) draft.idealAnswer = patch.idealAnswer
    if (patch.lesson !== undefined) draft.lesson = patch.lesson
    draft.tags = patch.tags
    ElMessage.success('AI 建议已填入草稿，请检查后点击「保存修改」')
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

/* 抽屉打开时左页让出右侧空间，保持全部模块可见、可继续点标题切换 */
.page--zoomed {
  --zoom-panel-width: min(52vw, 680px);
  padding-right: calc(var(--zoom-panel-width) + 20px);
}
.page--zoomed .page-header {
  flex-wrap: wrap;
}

.zoom-panel {
  position: fixed;
  top: 56px;
  right: 0;
  bottom: 0;
  z-index: 30;
  width: var(--zoom-panel-width, 52vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -6px 0 18px rgb(31 35 41 / 8%);
  animation: zoom-in 0.2s ease-out;
}
@keyframes zoom-in {
  from {
    transform: translateX(16px);
    opacity: 0.5;
  }
  to {
    transform: translateX(0);
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
.zoom-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}
.zoom-chip {
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}
.zoom-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.zoom-chip.is-active {
  background: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
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

@media (max-width: 900px) {
  .page--zoomed {
    --zoom-panel-width: 100vw;
    padding-right: 28px;
  }
  .zoom-panel {
    top: 0;
    border-left: none;
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
