<template>
  <el-alert v-if="error" type="error" :closable="false" show-icon class="plugin-error">
    <template #title>扩展「{{ boundaryProps.label }}」渲染失败，已隔离，不影响其他功能</template>
    <template #default>
      <div class="msg">{{ error }}</div>
      <el-button size="small" @click="retry">重试</el-button>
    </template>
  </el-alert>
  <component :is="boundaryProps.component" v-else v-bind="boundaryProps.componentProps ?? {}" />
</template>

<script setup lang="ts">
/**
 * 插件错误边界。
 *
 * 组件必须以 prop 形式传入、由本组件内部渲染，而不是通过默认插槽：
 * 插槽内容属于父组件的渲染上下文，onErrorCaptured 未必能稳定捕获其后代错误。
 * 返回 false 阻止错误继续冒泡到 app.config.errorHandler / 整棵组件树。
 */
import { onErrorCaptured, ref, type Component } from 'vue'

const boundaryProps = defineProps<{
  label: string
  component: Component
  componentProps?: Record<string, unknown>
}>()

const error = ref<string | null>(null)

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err.message : String(err)
  console.error(`[plugin-boundary] ${boundaryProps.label} 渲染异常`, err)
  return false
})

function retry(): void {
  error.value = null
}
</script>

<style scoped>
.plugin-error {
  margin: 8px 0;
}
.msg {
  font-size: 12px;
  color: var(--text-muted);
  margin: 6px 0 10px;
  word-break: break-all;
}
</style>
