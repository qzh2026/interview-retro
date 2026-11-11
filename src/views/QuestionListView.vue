<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>题目复盘</h1>
        <p>所有被问过的题，支持全文搜索与按知识点筛选</p>
      </div>
      <el-button type="primary" @click="dialogVisible = true">+ 独立录题</el-button>
    </div>

    <div class="card mb-16 filter-bar">
      <el-input v-model="keyword" clearable placeholder="搜题目 / 回答 / 标签" style="max-width: 320px" />
      <el-select v-model="category" clearable placeholder="全部分类" style="width: 160px">
        <el-option v-for="o in CATEGORY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select v-model="mastery" clearable placeholder="全部掌握度" style="width: 150px">
        <el-option v-for="o in MASTERY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <span class="muted">共 {{ filtered.length }} 条</span>
    </div>

    <div class="card">
      <el-table :data="filtered" empty-text="没有匹配的题目" @row-click="goDetail">
        <el-table-column label="题目" min-width="280">
          <template #default="{ row }">
            <div class="q-cell">{{ row.content }}</div>
            <div class="q-tags">
              <el-tag v-for="tag in row.tags.slice(0, 3)" :key="tag" size="small">{{ tag }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120">
          <template #default="{ row }">{{ labelOf(CATEGORY_OPTIONS, row.category) }}</template>
        </el-table-column>
        <el-table-column label="自评" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.selfRating <= 2 ? 'danger' : 'info'">{{ row.selfRating }} 分</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="掌握度" width="110">
          <template #default="{ row }">{{ labelOf(MASTERY_OPTIONS, row.mastery) }}</template>
        </el-table-column>
        <el-table-column label="下次复习" width="120">
          <template #default="{ row }">{{ row.nextReviewAt || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="goDetail(row)">复盘</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="录入一道题" width="680px" top="5vh">
      <QuestionForm :default-interview-id="null" @submit="onAddQuestion" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useQuestionStore } from '@/stores/question'
import { CATEGORY_OPTIONS, MASTERY_OPTIONS, labelOf } from '@/constants'
import type { MasteryLevel, Question, QuestionCategory, QuestionInput } from '@/types'
import QuestionForm from '@/components/common/QuestionForm.vue'

const router = useRouter()
const questionStore = useQuestionStore()
const keyword = ref('')
const category = ref<QuestionCategory | ''>('')
const mastery = ref<MasteryLevel | ''>('')
const dialogVisible = ref(false)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return questionStore.items.filter((q) => {
    if (category.value && q.category !== category.value) return false
    if (mastery.value && q.mastery !== mastery.value) return false
    if (!kw) return true
    return [q.content, q.myAnswer, q.idealAnswer, q.lesson, ...q.tags]
      .join(' ')
      .toLowerCase()
      .includes(kw)
  })
})

function goDetail(row: Question): void {
  router.push(`/questions/${row.id}`)
}

async function onAddQuestion(payload: QuestionInput): Promise<void> {
  await questionStore.create(payload)
  dialogVisible.value = false
  ElMessage.success('题目已保存')
}
</script>

<style scoped>
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.filter-bar .muted { font-size: 12px; margin-left: auto; }
.q-cell { font-size: 13px; line-height: 1.5; }
.q-tags { margin-top: 5px; display: flex; gap: 5px; }
</style>
