<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>高频标签</h1>
        <p>这个页面由内置示例插件通过 registerRoute + registerMenuItem 动态注册</p>
      </div>
    </div>
    <div class="card">
      <div v-if="tags.length === 0" class="muted">暂无标签数据</div>
      <div v-for="item in tags" :key="item.name" class="bar-row">
        <span class="bar-label">{{ item.name }}</span>
        <div class="bar-track">
          <div class="bar-fill" :style="{ width: `${(item.count / max) * 100}%` }" />
        </div>
        <span class="bar-value">{{ item.count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuestionStore } from '@/stores/question'

const store = useQuestionStore()
const tags = computed(() => {
  const counts = new Map<string, number>()
  store.items.forEach((q) => {
    q.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1))
  })
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
})
const max = computed(() => Math.max(1, ...tags.value.map((t) => t.count)))
</script>

<style scoped>
.bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 12px; }
.bar-label { width: 120px; color: var(--text-muted); }
.bar-track { flex: 1; height: 8px; background: var(--primary-soft); border-radius: 6px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--primary); border-radius: 6px; }
.bar-value { width: 28px; text-align: right; }
.muted { font-size: 13px; color: var(--text-muted); }
</style>
