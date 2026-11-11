<template>
  <div v-if="tags.length > 0" class="tags">
    <el-tag v-for="item in tags" :key="item.name" size="small" effect="plain">
      {{ item.name }} · {{ item.count }}
    </el-tag>
  </div>
  <div v-else class="muted">还没有标签数据，录题时加几个知识点标签吧</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useQuestionStore } from '@/stores/question'

// UI 插槽组件可以直接用 Pinia store，天然响应式
const store = useQuestionStore()
const tags = computed(() => {
  const counts = new Map<string, number>()
  store.items.forEach((q) => {
    q.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1))
  })
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})
</script>

<style scoped>
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.muted { font-size: 12px; color: var(--text-muted); }
</style>
