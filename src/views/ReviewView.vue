<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>今日复习</h1>
        <p>先自己回忆一遍，再翻答案；记住了就拉长间隔，没记住明天再来</p>
      </div>
      <el-button @click="resetQueue">重新载入队列</el-button>
    </div>

    <div v-if="!current" class="card">
      <el-empty :description="finished ? '今天的复习任务完成了，明天见' : '当前没有到期需要复习的题'" />
      <div class="center">
        <el-button @click="$router.push('/questions')">去题库看看</el-button>
      </div>
    </div>

    <template v-else>
      <div class="progress-line">
        <span class="muted">进度 {{ index + 1 }} / {{ queue.length }}</span>
        <div class="bar-track"><div class="bar-fill" :style="{ width: `${(index / queue.length) * 100}%` }" /></div>
      </div>

      <section class="card question-card">
        <div class="q-meta">
          {{ labelOf(CATEGORY_OPTIONS, current.category) }} · 难度 {{ current.difficulty }} ·
          自评 {{ current.selfRating }} 分
          <el-tag v-for="tag in current.tags" :key="tag" size="small" class="tag">{{ tag }}</el-tag>
        </div>
        <h2>{{ current.content }}</h2>

        <div v-if="!revealed" class="recall-hint">
          先在脑子里（或纸上）答一遍，再点下面按钮对照
        </div>

        <div v-else class="answer-grid">
          <div>
            <h3 class="section-title">我当时怎么答的</h3>
            <div class="answer-box">{{ current.myAnswer || '（当时没记录）' }}</div>
          </div>
          <div>
            <h3 class="section-title">复盘后的正确思路</h3>
            <div class="answer-box primary">{{ current.idealAnswer || '（还没整理参考答案）' }}</div>
          </div>
          <div v-if="current.lesson" class="lesson-box">
            <strong>踩坑点：</strong>{{ current.lesson }}
          </div>
        </div>
      </section>

      <div class="actions">
        <el-button v-if="!revealed" size="large" type="primary" @click="revealed = true">显示答案与复盘</el-button>
        <template v-else>
          <el-button size="large" @click="answer(false)">没记住，明天再来</el-button>
          <el-button size="large" type="primary" @click="answer(true)">记住了，拉长间隔</el-button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useQuestionStore } from '@/stores/question'
import { useSettingsStore } from '@/stores/settings'
import { CATEGORY_OPTIONS, labelOf } from '@/constants'
import type { Question } from '@/types'

const questionStore = useQuestionStore()
const settingsStore = useSettingsStore()

// 用快照队列：避免打卡后 store 变化导致列表重排、指针错乱
const queue = ref<Question[]>([])
const index = ref(0)
const revealed = ref(false)
const current = computed<Question | null>(() => queue.value[index.value] ?? null)
const finished = computed(() => queue.value.length > 0 && index.value >= queue.value.length)

function resetQueue(): void {
  queue.value = questionStore.dueQuestions(settingsStore.settings.dailyReviewLimit)
  index.value = 0
  revealed.value = false
}

onMounted(resetQueue)

async function answer(remembered: boolean): Promise<void> {
  if (!current.value) return
  await questionStore.markReviewed(current.value.id, remembered)
  index.value += 1
  revealed.value = false
}
</script>

<style scoped>
.progress-line { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; font-size: 12px; }
.bar-track { flex: 1; height: 6px; background: var(--primary-soft); border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); }
.question-card { min-height: 300px; }
.q-meta { font-size: 12px; color: var(--text-muted); }
.tag { margin-left: 6px; }
.question-card h2 { font-size: 19px; line-height: 1.6; margin: 18px 0 24px; }
.recall-hint { padding: 40px 0; text-align: center; color: var(--text-muted); font-size: 13px; }
.answer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.answer-box {
  background: var(--bg); border-radius: 8px; padding: 14px; min-height: 110px;
  white-space: pre-wrap; font-size: 13px; line-height: 1.7;
}
.answer-box.primary { background: var(--primary-soft); }
.lesson-box {
  grid-column: 1 / -1; font-size: 13px; line-height: 1.7;
  border-left: 3px solid var(--warning); padding: 10px 14px; background: var(--bg);
}
.actions { display: flex; justify-content: center; gap: 14px; margin-top: 22px; }
.center { text-align: center; }
@media (max-width: 900px) { .answer-grid { grid-template-columns: 1fr; } }
</style>
