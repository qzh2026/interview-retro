<template>
  <div>
    <div class="flex-between mb-16">
      <span class="muted">最多保留 50 条，由插件独立存储并随 JSON 备份一起导出</span>
      <el-button size="small" @click="reload">刷新</el-button>
    </div>
    <div v-if="entries.length === 0" class="muted">还没有打卡记录，去「今日复习」练一题吧</div>
    <div v-for="(item, idx) in entries" :key="idx" class="log-row">
      <span>{{ formatDateTime(item.at) }}</span>
      <el-tag size="small" :type="tagType(item.remembered)">
        {{ item.remembered ? '记住了' : '没记住' }}
      </el-tag>
      <span class="muted">下次 {{ item.nextReviewAt ?? '—' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { formatDateTime, getPluginSettings } from '@/sdk'

interface LogEntry {
  at: string
  remembered: boolean
  nextReviewAt: string | null
}

const entries = ref<LogEntry[]>([])

function reload(): void {
  entries.value = getPluginSettings<LogEntry[]>('builtin:review-log') ?? []
}

function tagType(remembered: boolean): 'success' | 'danger' {
  return remembered ? 'success' : 'danger'
}

onMounted(reload)
</script>

<style scoped>
.log-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.log-row:last-child {
  border-bottom: none;
}
.muted {
  color: var(--text-muted);
}
</style>
