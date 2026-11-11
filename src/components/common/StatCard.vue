<template>
  <div class="card stat-card" :class="`tone-${tone}`">
    <div class="stat-value">{{ value }}</div>
    <div class="stat-label">{{ label }}</div>
    <div v-if="hint" class="stat-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'primary' | 'warning' | 'danger'
  }>(),
  { tone: 'default', hint: '' },
)
</script>

<style scoped>
.stat-card {
  border-left: 3px solid transparent;
}
.stat-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 8px;
}
.tone-primary {
  border-left-color: var(--primary);
}
.tone-warning {
  border-left-color: var(--warning);
}
.tone-danger {
  border-left-color: var(--danger);
}
</style>
