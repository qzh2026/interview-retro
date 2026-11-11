<template>
  <el-container class="layout">
    <el-aside class="sidebar" width="216px">
      <div class="brand">
        <strong>面经复盘</strong>
        <span>Interview Retro</span>
      </div>
      <el-menu :default-active="activeMenu" router class="menu">
        <el-menu-item index="/">总览</el-menu-item>
        <el-menu-item index="/interviews">面试场次</el-menu-item>
        <el-menu-item index="/questions">题目复盘</el-menu-item>
        <el-menu-item index="/review">
          今日复习
          <el-badge v-if="dueCount > 0" :value="dueCount" class="menu-badge" type="primary" />
        </el-menu-item>
        <el-menu-item index="/settings">数据与备份</el-menu-item>
        <!-- menuItem 扩展点：插件注册的侧边栏入口 -->
        <el-menu-item v-for="item in extensionMenuItems" :key="item.id" :index="item.path">
          {{ item.label }}
        </el-menu-item>
      </el-menu>
      <div class="sidebar-foot">纯本地存储<br />记得定期导出备份</div>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span class="crumb">{{ route.meta.title ?? '面经复盘' }}</span>
        <span class="header-right">
          {{ today }}
          <el-tag :type="syncTagType" size="small" effect="plain" class="sync-tag">
            {{ syncLabel }}
          </el-tag>
        </span>
      </el-header>
      <el-main class="main">
        <!-- 存储健康告警：写入失败 / 数据损坏这类静默故障必须让用户看见 -->
        <el-alert
          v-if="storageIssue"
          :type="storageIssue.kind === 'corrupt' ? 'error' : 'warning'"
          :closable="false"
          show-icon
          class="health-alert"
        >
          <template #title>{{ storageIssue.message }}</template>
          <template #default>
            <div class="health-actions">
              <el-button
                v-if="storageIssue.kind === 'corrupt'"
                size="small"
                type="danger"
                plain
                @click="downloadCorruptSnapshot"
              >
                下载原始数据副本
              </el-button>
              <el-button size="small" @click="dismissStorageIssue">
                {{ storageIssue.kind === 'corrupt' ? '我已保存副本，忽略提示' : '忽略提示' }}
              </el-button>
            </div>
          </template>
        </el-alert>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getMenuItems } from '@/core/extensions/registry'
import { useQuestionStore } from '@/stores/question'
import { todayISO } from '@/utils/date'
import { downloadTextFile } from '@/services/backup'
import { getCorruptSnapshot, clearCorruptSnapshot } from '@/services/storage'
import {
  clearStorageIssue,
  subscribeStorageIssue,
  type StorageIssue,
} from '@/services/storage-health'
import { syncStatus } from '@/services/cloud/status'

// 先订阅再创建 store：启动期预加载（initializeStores）可能已经产生告警。
// subscribeStorageIssue 订阅时会立即回放当前状态，所以晚订阅也不会漏掉启动期告警。
const storageIssue = ref<StorageIssue | null>(null)
const stopWatching = subscribeStorageIssue((issue) => {
  storageIssue.value = issue
})
onUnmounted(stopWatching)

const route = useRoute()
const questionStore = useQuestionStore()
const dueCount = computed(() => questionStore.dueCount)
const today = todayISO()

/** 顶栏常驻同步状态条：本机 / 同步中 / 离线 / 出错 + 待推送数 */
const syncLabel = computed(() => {
  const base = {
    disabled: '本机数据',
    idle: '同步正常',
    syncing: '同步中…',
    offline: '离线可用',
    error: '同步异常',
  }[syncStatus.phase]
  return syncStatus.pendingCount > 0 ? `${base} · 待推送 ${syncStatus.pendingCount}` : base
})
const syncTagType = computed(() => {
  return (
    {
      disabled: 'info',
      idle: 'success',
      syncing: 'primary',
      offline: 'warning',
      error: 'danger',
    } as const
  )[syncStatus.phase]
})
// bootstrap 在 mount 前完成，此处拿到的是已注册完成的菜单项
const extensionMenuItems = getMenuItems()

// 详情页没有对应菜单项，回退到所属模块高亮
const activeMenu = computed(() => {
  const path = route.path
  if (path.startsWith('/interviews')) return '/interviews'
  if (path.startsWith('/questions')) return '/questions'
  return path
})

function downloadCorruptSnapshot(): void {
  const raw = getCorruptSnapshot() ?? storageIssue.value?.raw
  if (!raw) return
  downloadTextFile(`面经复盘-损坏数据副本-${todayISO()}.txt`, raw, 'text/plain;charset=utf-8')
}

function dismissStorageIssue(): void {
  // 数据损坏时连同原始副本一起清掉；其他类型只关闭提示
  if (storageIssue.value?.kind === 'corrupt') clearCorruptSnapshot()
  else clearStorageIssue()
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
}
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}
.brand {
  padding: 22px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.brand strong {
  font-size: 17px;
  letter-spacing: 0.5px;
}
.brand span {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 1px;
}
.menu {
  border-right: none;
  flex: 1;
}
.menu-badge {
  margin-left: 8px;
}
.sidebar-foot {
  padding: 16px 20px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-muted);
  border-top: 1px solid var(--border);
}
.header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}
.crumb {
  font-weight: 600;
  font-size: 14px;
}
.header-right {
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.sync-tag {
  font-weight: 400;
}
.main {
  padding: 0;
  background: var(--bg);
}
.health-alert {
  margin: 16px 16px 0;
}
.health-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
