<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>{{ interview ? `${interview.company} · ${interview.position}` : '场次不存在' }}</h1>
        <p v-if="interview">
          {{ interview.date }} · {{ labelOf(ROUND_OPTIONS, interview.round) }} ·
          {{ labelOf(RESULT_OPTIONS, interview.result) }}
        </p>
      </div>
      <div class="header-actions">
        <el-button @click="$router.push('/interviews')">返回列表</el-button>
        <el-button type="primary" :disabled="!interview" @click="dialogVisible = true"
          >+ 添加被问的题</el-button
        >
      </div>
    </div>

    <el-empty v-if="!interview" description="这场面试记录可能已被删除" />

    <template v-else>
      <section class="card mb-16">
        <div class="flex-between mb-16">
          <h2 class="section-title" style="margin: 0">本场信息</h2>
          <el-select v-model="result" size="small" style="width: 150px" @change="onResultChange">
            <el-option
              v-for="o in RESULT_OPTIONS"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </div>
        <div class="meta-grid">
          <div>
            <span class="muted">渠道</span>
            <div>{{ interview.source || '—' }}</div>
          </div>
          <div>
            <span class="muted">面试官</span>
            <div>{{ interview.interviewer || '—' }}</div>
          </div>
          <div>
            <span class="muted">题目数</span>
            <div>{{ questions.length }}</div>
          </div>
        </div>
        <div v-if="interview.overallNotes" class="notes">{{ interview.overallNotes }}</div>
      </section>

      <section class="card">
        <h2 class="section-title">本场被问到的题（{{ questions.length }}）</h2>
        <el-empty
          v-if="questions.length === 0"
          description="还没有录题，把能想起来的题逐条补上"
          :image-size="80"
        />
        <div v-else>
          <div
            v-for="(q, idx) in questions"
            :key="q.id"
            class="question-row"
            @click="$router.push(`/questions/${q.id}`)"
          >
            <span class="idx">{{ idx + 1 }}</span>
            <div class="q-body">
              <div class="q-content">{{ q.content }}</div>
              <div class="q-meta">
                {{ labelOf(CATEGORY_OPTIONS, q.category) }} · {{ q.selfRating }} 分 ·
                {{ labelOf(MASTERY_OPTIONS, q.mastery) }}
                <el-tag v-for="tag in q.tags" :key="tag" size="small" class="tag">{{ tag }}</el-tag>
              </div>
            </div>
            <el-button link type="primary">复盘 →</el-button>
          </div>
        </div>
      </section>
    </template>

    <el-dialog v-model="dialogVisible" title="添加一道被问到的题" width="680px" top="5vh">
      <QuestionForm :default-interview-id="id" @submit="onAddQuestion" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useInterviewStore } from '@/stores/interview'
import { useQuestionStore } from '@/stores/question'
import {
  CATEGORY_OPTIONS,
  MASTERY_OPTIONS,
  RESULT_OPTIONS,
  ROUND_OPTIONS,
  labelOf,
} from '@/constants'
import type { InterviewResult, QuestionInput } from '@/types'
import QuestionForm from '@/components/common/QuestionForm.vue'
import { toUserMessage } from '@/services/cloud/http'

const route = useRoute()
const interviewStore = useInterviewStore()
const questionStore = useQuestionStore()
const id = computed(() => String(route.params.id ?? ''))
const interview = computed(() => interviewStore.getById(id.value))
const questions = computed(() => questionStore.byInterview(id.value))
const result = ref<InterviewResult>('pending')
const dialogVisible = ref(false)

watch(
  interview,
  (value) => {
    if (value) result.value = value.result
  },
  { immediate: true },
)

async function onResultChange(value: InterviewResult): Promise<void> {
  try {
    await interviewStore.update(id.value, { result: value })
    ElMessage.success('结果已更新')
  } catch (err) {
    ElMessage.error(toUserMessage(err))
  }
}

async function onAddQuestion(payload: QuestionInput): Promise<void> {
  try {
    await questionStore.create(payload)
    dialogVisible.value = false
    ElMessage.success('题目已保存，明天进入第一轮复习')
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
.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  font-size: 13px;
}
.meta-grid .muted {
  font-size: 11px;
  display: block;
  margin-bottom: 5px;
}
.notes {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg);
  border-radius: 6px;
  font-size: 13px;
  white-space: pre-wrap;
}
.question-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.question-row:last-child {
  border-bottom: none;
}
.idx {
  color: var(--text-muted);
  font-size: 12px;
  width: 20px;
  padding-top: 2px;
}
.q-body {
  flex: 1;
  min-width: 0;
}
.q-content {
  font-size: 13px;
  line-height: 1.6;
}
.q-meta {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}
.tag {
  margin-left: 6px;
}
</style>
