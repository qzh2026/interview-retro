<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>数据与备份</h1>
        <p>数据只存在这台设备的浏览器里，导出 JSON 是唯一的保命手段</p>
      </div>
    </div>

    <section class="card mb-16">
      <h2 class="section-title">复习策略</h2>
      <div class="setting-row">
        <div>
          <strong>间隔阶梯（天）</strong>
          <div class="muted">复习成功进入下一阶，失败打回第一阶；用逗号分隔</div>
        </div>
        <el-input v-model="intervalText" style="width: 260px" placeholder="1, 3, 7, 15, 30, 60" />
      </div>
      <div class="setting-row">
        <div>
          <strong>每日复习上限</strong>
          <div class="muted">避免一次堆太多题导致放弃</div>
        </div>
        <el-input-number v-model="dailyLimit" :min="1" :max="200" />
      </div>
      <div class="right"><el-button type="primary" @click="onSaveSettings">保存设置</el-button></div>
    </section>

    <section class="card mb-16">
      <h2 class="section-title">备份与恢复</h2>
      <el-alert type="warning" :closable="false" show-icon class="mb-16" title="清除浏览器数据 / 换电脑 / 换浏览器都会导致数据丢失，建议每周导出一次" />
      <div class="backup-actions">
        <el-button type="primary" @click="onExport">导出 JSON 备份</el-button>
        <el-button @click="fileInput?.click()">从 JSON 导入</el-button>
        <el-button type="danger" plain @click="onClear">清空全部数据</el-button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFileChange" />
      </div>
      <div class="muted usage">当前：{{ settingsStore.usage.count }} 条记录，约 {{ settingsStore.usage.kb }} KB（本地存储上限约 5 MB）</div>
    </section>

    <section class="card mb-16">
      <h2 class="section-title">扩展管理</h2>
      <p class="muted intro">
        插件在 <code>src/plugins/index.ts</code> 注册。新增或注释掉一行即可装卸；
        关闭开关后需刷新页面生效。所有扩展点类型见 <code>src/sdk/types.ts</code>。
      </p>

      <el-table :data="pluginList" size="small" class="mb-16">
        <el-table-column label="插件" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.manifest.name }}</strong>
            <div class="muted">{{ row.manifest.id }} · v{{ row.manifest.version }}</div>
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="220">
          <template #default="{ row }">{{ row.manifest.description }}</template>
        </el-table-column>
        <el-table-column label="扩展点" min-width="230">
          <template #default="{ row }">
            <el-tag v-for="p in row.manifest.contributes" :key="p" size="small" class="point-tag">
              {{ pointLabel(p) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" @change="onTogglePlugin(row.manifest.id, $event)" />
          </template>
        </el-table-column>
      </el-table>

      <div class="adapter-line mb-16">
        <span>存储：<strong>{{ adapters.storage.label }}</strong></span>
        <span v-if="adapters.asyncStorage">云同步：<strong>{{ adapters.asyncStorage.label }}</strong>（优先）</span>
        <span>AI：<strong>{{ adapters.ai.label }}</strong></span>
        <span>复习策略：<strong>{{ adapters.review.label }}</strong></span>
      </div>

      <div class="sub-section">
        <h3 class="sub-title">导出格式</h3>
        <div class="backup-actions">
          <el-button v-for="format in exporters" :key="format.id" @click="runExport(format.id)">
            {{ format.label }}
          </el-button>
          <span v-if="exporters.length === 0" class="muted">暂无插件注册的导出格式</span>
        </div>
      </div>

      <div class="sub-section">
        <h3 class="sub-title">导入格式</h3>
        <div class="backup-actions">
          <el-button v-for="format in importers" :key="format.id" @click="openImport(format.id)">
            {{ format.label }}
          </el-button>
          <span v-if="importers.length === 0" class="muted">暂无插件注册的导入格式</span>
          <input ref="importInput" type="file" :accept="acceptAttr" hidden @change="onImportFileChange" />
        </div>
      </div>
    </section>

    <!-- settingsPanel 扩展点：插件注册的设置面板 -->
    <section v-for="panel in panels" :key="panel.id" class="card mb-16">
      <h2 class="section-title">
        {{ panel.title }}
        <el-tag size="small" type="info" class="point-tag">插件面板</el-tag>
      </h2>
      <PluginBoundary :label="panel.title" :component="panel.component" />
    </section>

    <section class="card">
      <h2 class="section-title">架构备注</h2>
      <ul class="notes">
        <li>纯前端单机版：无账号、无后端、无数据库，构建产物可直接静态托管。</li>
        <li>核心代码只依赖 <code>src/sdk</code> 里的接口，插件通过注册表注入实现，不改动核心文件。</li>
        <li>插件配置随 JSON 备份一起导出 / 恢复；<code>metadata</code> 字段供插件存自定义数据。</li>
        <li>AI 接入必须通过后端代理保管密钥，不要写进前端环境变量。</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getActiveAdapters,
  getExporters,
  getImporters,
  getSettingsPanels,
  listPlugins,
  setPluginEnabled,
} from '@/core/extensions/registry'
import { useSettingsStore } from '@/stores/settings'
import { useInterviewStore } from '@/stores/interview'
import { useQuestionStore } from '@/stores/question'
import { downloadTextFile } from '@/services/backup'
import PluginBoundary from '@/components/common/PluginBoundary.vue'
import { loadState } from '@/services/storage'
import { todayISO } from '@/utils/date'
import type { ExportContext, ExtensionPoint } from '@/sdk'

const POINT_LABELS: Record<ExtensionPoint, string> = {
  event: '事件订阅',
  storageAdapter: '存储适配器',
  asyncStorageAdapter: '异步存储适配器',
  aiAdapter: 'AI 适配器',
  reviewStrategy: '复习策略',
  importer: '导入格式',
  exporter: '导出格式',
  menuItem: '菜单项',
  route: '页面路由',
  dashboardWidget: '总览卡片',
  questionDetailTab: '题目面板',
  settingsPanel: '设置面板',
}

/** 表格插槽里的 row 是 any，统一收口做安全索引 */
function pointLabel(point: unknown): string {
  return POINT_LABELS[point as ExtensionPoint] ?? String(point)
}

const settingsStore = useSettingsStore()
const interviewStore = useInterviewStore()
const questionStore = useQuestionStore()

const intervalText = ref(settingsStore.settings.reviewIntervals.join(', '))
const dailyLimit = ref(settingsStore.settings.dailyReviewLimit)
const fileInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)

const pluginList = ref(listPlugins())
const exporters = getExporters()
const importers = getImporters()
const panels = getSettingsPanels()
const adapters = getActiveAdapters()
const acceptAttr = computed(() => importers.map((item) => item.accept).join(','))
let activeImporterId = ''

async function onSaveSettings(): Promise<void> {
  const list = intervalText.value
    .split(/[,，\s]+/)
    .map((item) => Number(item))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (list.length === 0) {
    ElMessage.warning('请填写至少一个大于 0 的天数')
    return
  }
  await settingsStore.update({ reviewIntervals: list, dailyReviewLimit: dailyLimit.value })
  ElMessage.success('复习策略已保存')
}

async function onExport(): Promise<void> {
  await settingsStore.exportToFile()
}

async function onFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    await ElMessageBox.confirm('导入会覆盖当前全部数据，建议先导出一份备份。确定继续？', '覆盖导入', {
      type: 'warning',
      confirmButtonText: '确认导入',
    })
    await settingsStore.importFromText(await file.text())
    await Promise.all([interviewStore.refresh(), questionStore.refresh()])
    intervalText.value = settingsStore.settings.reviewIntervals.join(', ')
    dailyLimit.value = settingsStore.settings.dailyReviewLimit
    ElMessage.success('导入成功')
  } catch (err) {
    if (err instanceof Error && err.message !== 'cancel') {
      ElMessage.error(err.message)
    }
  } finally {
    target.value = ''
  }
}

async function onClear(): Promise<void> {
  try {
    await ElMessageBox.confirm('所有面试场次和题目都会被删除，且无法恢复。确定清空？', '危险操作', {
      type: 'warning',
      confirmButtonText: '确认清空',
    })
  } catch {
    return
  }
  await settingsStore.clearAll()
  await Promise.all([interviewStore.refresh(), questionStore.refresh()])
  ElMessage.success('已清空')
}

function onTogglePlugin(id: string, value: unknown): void {
  setPluginEnabled(id, Boolean(value))
  pluginList.value = pluginList.value.map((item) =>
    item.manifest.id === id ? { ...item, enabled: Boolean(value) } : item,
  )
  ElMessage.info('已保存，刷新页面后生效')
}

async function runExport(formatId: string): Promise<void> {
  const format = exporters.find((item) => item.id === formatId)
  if (!format) return
  const state = await loadState()
  const ctx: ExportContext = {
    interviews: state.interviews,
    questions: state.questions,
    settings: state.settings,
    today: todayISO(),
  }
  try {
    const result = format.run(ctx)
    downloadTextFile(result.filename, result.content, result.mimeType)
    ElMessage.success(`已导出 ${result.filename}`)
  } catch (err) {
    ElMessage.error(`导出失败：${(err as Error).message}`)
  }
}

function openImport(formatId: string): void {
  activeImporterId = formatId
  importInput.value?.click()
}

async function onImportFileChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const format = importers.find((item) => item.id === activeImporterId)
  if (!format) return
  try {
    const data = format.parse(await file.text(), { settings: settingsStore.settings })
    // 批量写入：一次读、一次写，不要逐条 create（会造成 N 次全量序列化）
    const interviews = await interviewStore.createMany(data.interviews ?? [])
    const questions = await questionStore.createMany(data.questions ?? [])
    await settingsStore.refreshUsage()
    ElMessage.success(`导入完成：${interviews.length} 场面试，${questions.length} 道题`)
  } catch (err) {
    ElMessage.error(`导入失败：${(err as Error).message}`)
  } finally {
    target.value = ''
  }
}
</script>

<style scoped>
.setting-row {
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 14px 0; border-bottom: 1px solid var(--border); font-size: 13px;
}
.setting-row:last-of-type { border-bottom: none; }
.setting-row .muted { font-size: 11px; margin-top: 4px; }
.right { display: flex; justify-content: flex-end; margin-top: 14px; }
.backup-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.usage { font-size: 12px; margin-top: 14px; }
.intro { font-size: 12px; line-height: 1.8; margin: 0 0 16px; }
.intro code, .notes code { background: var(--bg); padding: 1px 5px; border-radius: 4px; }
.point-tag { margin-right: 6px; margin-bottom: 4px; }
.adapter-line { display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted); }
.adapter-line strong { color: var(--text); }
.sub-section { margin-top: 16px; }
.sub-title { font-size: 13px; font-weight: 500; margin: 0 0 10px; }
.notes { font-size: 13px; line-height: 2; color: var(--text-muted); padding-left: 18px; margin: 0; }
</style>
