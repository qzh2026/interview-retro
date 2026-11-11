<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>总览</h1>
        <p>把每一场面试里答砸的题，变成下一次的底气</p>
      </div>
      <el-button type="primary" @click="$router.push('/interviews')">记录一场面试</el-button>
    </div>

    <div class="stat-grid">
      <StatCard label="面试场次" :value="interviewStore.items.length" hint="累计记录" />
      <StatCard label="累计题目" :value="questionStore.total" hint="复盘的最小粒度" />
      <StatCard label="未掌握" :value="questionStore.unknownCount" tone="warning" hint="需要重点攻克" />
      <StatCard label="今日待复习" :value="questionStore.dueCount" tone="primary" hint="按间隔重复到期" />
    </div>

    <el-alert
      v-if="questionStore.dueCount > 0"
      type="info"
      :closable="false"
      class="mb-16"
      show-icon
    >
      <template #title>
        今天有 {{ questionStore.dueCount }} 道题到期
        <el-button link type="primary" @click="$router.push('/review')">开始复习 →</el-button>
      </template>
    </el-alert>

    <div class="two-col">
      <section class="card">
        <h2 class="section-title">最近的面试</h2>
        <div v-if="interviewStore.sorted.length === 0" class="empty-inline">
          还没有记录。先添加一场面试，再把被问到的题逐条录进来。
        </div>
        <div v-else>
          <div
            v-for="item in interviewStore.sorted.slice(0, 5)"
            :key="item.id"
            class="list-row"
            @click="$router.push(`/interviews/${item.id}`)"
          >
            <div>
              <strong>{{ item.company }}</strong>
              <span class="muted"> · {{ item.position }}</span>
              <div class="sub">{{ item.date }} · {{ labelOf(ROUND_OPTIONS, item.round) }}</div>
            </div>
            <el-tag size="small" :type="resultTagType(item.result)">
              {{ labelOf(RESULT_OPTIONS, item.result) }}
            </el-tag>
          </div>
        </div>
      </section>

      <section class="card">
        <h2 class="section-title">最该复盘的 5 道题</h2>
        <div v-if="questionStore.weakQuestions.length === 0" class="empty-inline">
          暂无低分题，状态不错。
        </div>
        <div v-else>
          <div
            v-for="q in questionStore.weakQuestions"
            :key="q.id"
            class="list-row"
            @click="$router.push(`/questions/${q.id}`)"
          >
            <div class="ellipsis">{{ q.content }}</div>
            <el-tag size="small" type="danger">{{ q.selfRating }} 分</el-tag>
          </div>
        </div>
      </section>
    </div>

    <section class="card mt-16" v-if="questionStore.categoryDistribution.length > 0">
      <h2 class="section-title">题目分布</h2>
      <div v-for="item in questionStore.categoryDistribution" :key="item.label" class="bar-row">
        <span class="bar-label">{{ item.label }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: `${(item.value / questionStore.total) * 100}%` }" />
        </div>
        <span class="bar-value">{{ item.value }}</span>
      </div>
    </section>

    <!-- dashboardWidget 扩展点：插件注册的总览卡片 -->
    <div v-if="widgets.length > 0" class="widget-grid mt-16">
      <section v-for="widget in widgets" :key="widget.id" class="card">
        <h2 class="section-title">
          {{ widget.title }}
          <el-tag size="small" type="info" class="plugin-badge">插件</el-tag>
        </h2>
        <PluginBoundary :label="widget.title" :component="widget.component" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getDashboardWidgets } from '@/core/extensions/registry'
import { useInterviewStore } from '@/stores/interview'
import { useQuestionStore } from '@/stores/question'
import { ROUND_OPTIONS, RESULT_OPTIONS, labelOf } from '@/constants'
import type { InterviewResult } from '@/types'
import StatCard from '@/components/common/StatCard.vue'
import PluginBoundary from '@/components/common/PluginBoundary.vue'

const interviewStore = useInterviewStore()
const questionStore = useQuestionStore()
const widgets = getDashboardWidgets()

function resultTagType(result: InterviewResult): 'success' | 'danger' | 'info' | 'warning' {
  if (result === 'passed' || result === 'offer') return 'success'
  if (result === 'failed') return 'danger'
  if (result === 'withdrawn') return 'warning'
  return 'info'
}
</script>

<style scoped>
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.empty-inline { color: var(--text-muted); font-size: 13px; padding: 24px 0; }
.list-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 11px 0; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 13px;
}
.list-row:last-child { border-bottom: none; }
.list-row:hover strong { color: var(--primary); }
.sub { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px; }
.bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 12px; }
.bar-label { width: 90px; color: var(--text-muted); }
.bar-track { flex: 1; height: 8px; background: var(--primary-soft); border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); border-radius: 6px; }
.bar-value { width: 28px; text-align: right; }
.widget-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
.plugin-badge { margin-left: 8px; }
@media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }
</style>
