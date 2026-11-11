<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>面试场次</h1>
        <p>按场次组织，每场下面挂当次被问到的题</p>
      </div>
      <el-button type="primary" @click="openCreate">+ 新增面试</el-button>
    </div>

    <div class="card">
      <el-table :data="interviewStore.sorted" empty-text="还没有面试记录，点右上角新增一场" @row-click="goDetail">
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="company" label="公司" min-width="140" />
        <el-table-column prop="position" label="岗位" min-width="140" />
        <el-table-column label="轮次" width="120">
          <template #default="{ row }">{{ labelOf(ROUND_OPTIONS, row.round) }}</template>
        </el-table-column>
        <el-table-column label="结果" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="resultTagType(row.result)">{{ labelOf(RESULT_OPTIONS, row.result) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="题目数" width="90" align="center">
          <template #default="{ row }">{{ interviewStore.questionCount(row.id) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="goDetail(row)">查看</el-button>
            <el-popconfirm title="删除该场次？题目会保留并解除关联" @confirm="onDelete(row.id)">
              <template #reference>
                <el-button link type="danger" @click.stop>删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="新增面试场次" width="560px">
      <el-form label-position="top" @submit.prevent="onCreate">
        <div class="form-row">
          <el-form-item label="公司 *">
            <el-input v-model="form.company" placeholder="例如：某某科技" />
          </el-form-item>
          <el-form-item label="岗位 *">
            <el-input v-model="form.position" placeholder="例如：后端开发工程师" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="日期">
            <el-date-picker v-model="form.date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          </el-form-item>
          <el-form-item label="轮次">
            <el-select v-model="form.round" style="width: 100%">
              <el-option v-for="o in ROUND_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="结果">
            <el-select v-model="form.result" style="width: 100%">
              <el-option v-for="o in RESULT_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="渠道">
            <el-input v-model="form.source" placeholder="内推 / BOSS / 官网" />
          </el-form-item>
        </div>
        <el-form-item label="本场整体感受">
          <el-input v-model="form.overallNotes" type="textarea" :rows="3" placeholder="流程、面试官关注点、自己的整体状态" />
        </el-form-item>
        <div class="form-actions">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" native-type="submit">保存</el-button>
        </div>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useInterviewStore } from '@/stores/interview'
import { ROUND_OPTIONS, RESULT_OPTIONS, labelOf } from '@/constants'
import type { Interview, InterviewInput, InterviewResult } from '@/types'
import { todayISO } from '@/utils/date'

const router = useRouter()
const interviewStore = useInterviewStore()
const dialogVisible = ref(false)

function blankForm(): InterviewInput {
  return {
    company: '',
    position: '',
    round: 'tech1',
    date: todayISO(),
    result: 'pending',
    source: '',
    interviewer: '',
    overallNotes: '',
  }
}
const form = reactive<InterviewInput>(blankForm())

function openCreate(): void {
  Object.assign(form, blankForm())
  dialogVisible.value = true
}

function onCreate(): void {
  if (!form.company.trim() || !form.position.trim()) {
    ElMessage.warning('公司和岗位不能为空')
    return
  }
  const created = interviewStore.create({ ...form, company: form.company.trim(), position: form.position.trim() })
  dialogVisible.value = false
  ElMessage.success('已创建，接着把被问到的题录进来吧')
  router.push(`/interviews/${created.id}`)
}

function goDetail(row: Interview): void {
  router.push(`/interviews/${row.id}`)
}

function onDelete(id: string): void {
  interviewStore.remove(id)
  ElMessage.success('场次已删除，题目已保留')
}

function resultTagType(result: InterviewResult): 'success' | 'danger' | 'info' | 'warning' {
  if (result === 'passed' || result === 'offer') return 'success'
  if (result === 'failed') return 'danger'
  if (result === 'withdrawn') return 'warning'
  return 'info'
}
</script>

<style scoped>
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
</style>
