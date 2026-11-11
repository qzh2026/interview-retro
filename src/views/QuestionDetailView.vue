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
        <el-button type="primary" @click="onSave">保存修改</el-button>
      </div>
    </div>

    <el-empty v-if="!question" description="这道题可能已被删除" />

    <template v-else>
      <section class="card mb-16">
        <h2 class="section-title">题目</h2>
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
          <h2 class="section-title">我当时怎么答的</h2>
          <el-input v-model="draft.myAnswer" type="textarea" :rows="7" placeholder="原样记录" />
        </section>
        <section class="card">
          <h2 class="section-title">复盘后的正确思路</h2>
          <el-input
            v-model="draft.idealAnswer"
            type="textarea"
            :rows="7"
            placeholder="查资料后整理"
          />
        </section>
      </div>

      <section class="card mb-16">
        <h2 class="section-title">踩坑点 · 下次怎么说</h2>
        <el-input v-model="draft.lesson" type="textarea" :rows="3" />
      </section>

      <section class="card review-panel">
        <div>
          <strong>复习打卡</strong>
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
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getQuestionDetailTabs } from '@/core/extensions/registry'
import { useQuestionStore } from '@/stores/question'
import { CATEGORY_OPTIONS, DIFFICULTY_OPTIONS, MASTERY_OPTIONS, RATING_OPTIONS } from '@/constants'
import { formatDateTime } from '@/utils/date'
import PluginBoundary from '@/components/common/PluginBoundary.vue'
import type { Difficulty, MasteryLevel, QuestionCategory, SelfRating } from '@/types'
import { toUserMessage } from '@/services/cloud/http'

const route = useRoute()
const router = useRouter()
const questionStore = useQuestionStore()
const id = computed(() => String(route.params.id ?? ''))
const question = computed(() => questionStore.getById(id.value))
const tabs = getQuestionDetailTabs()

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
