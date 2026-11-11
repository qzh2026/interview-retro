<template>
  <el-form label-position="top" @submit.prevent="submit">
    <el-form-item label="题目内容 *">
      <el-input
        v-model="form.content"
        type="textarea"
        :rows="2"
        placeholder="尽量还原面试官的原话，例如：讲讲 MySQL 事务隔离级别，以及你们线上用的是哪个"
      />
    </el-form-item>

    <div class="form-row">
      <el-form-item label="分类">
        <el-select v-model="form.category" style="width: 100%">
          <el-option
            v-for="o in CATEGORY_OPTIONS"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="难度">
        <el-select v-model="form.difficulty" style="width: 100%">
          <el-option
            v-for="o in DIFFICULTY_OPTIONS"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
      </el-form-item>
    </div>

    <el-form-item label="知识点标签">
      <el-select
        v-model="form.tags"
        multiple
        filterable
        allow-create
        default-first-option
        :reserve-keyword="false"
        placeholder="输入后回车，例如：MySQL、事务、索引"
        style="width: 100%"
      >
        <el-option v-for="tag in COMMON_TAGS" :key="tag" :label="tag" :value="tag" />
      </el-select>
    </el-form-item>

    <el-form-item label="我当时是怎么答的">
      <el-input
        v-model="form.myAnswer"
        type="textarea"
        :rows="3"
        placeholder="原样记录，别事后美化。答不上来就写「没答上来」，复盘才有价值"
      />
    </el-form-item>

    <el-form-item label="复盘后的正确思路">
      <el-input
        v-model="form.idealAnswer"
        type="textarea"
        :rows="3"
        placeholder="查资料 / 问人之后整理的参考答案"
      />
    </el-form-item>

    <el-form-item label="踩坑点 · 下次怎么说">
      <el-input
        v-model="form.lesson"
        type="textarea"
        :rows="2"
        placeholder="例如：只背了概念，没准备线上实践案例"
      />
    </el-form-item>

    <div class="form-row">
      <el-form-item label="自评">
        <el-select v-model="form.selfRating" style="width: 100%">
          <el-option v-for="o in RATING_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="掌握程度">
        <el-select v-model="form.mastery" style="width: 100%">
          <el-option
            v-for="o in MASTERY_OPTIONS"
            :key="o.value"
            :label="o.label"
            :value="o.value"
          />
        </el-select>
      </el-form-item>
    </div>

    <div class="form-actions">
      <span class="muted">提交后默认明天进入第一轮复习</span>
      <el-button type="primary" native-type="submit">保存这道题</el-button>
    </div>
  </el-form>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import type { QuestionInput } from '@/types'
import { CATEGORY_OPTIONS, DIFFICULTY_OPTIONS, MASTERY_OPTIONS, RATING_OPTIONS } from '@/constants'

const COMMON_TAGS = [
  'Java',
  'MySQL',
  'Redis',
  'JVM',
  '网络',
  '操作系统',
  '算法',
  '项目',
  'Spring',
  '前端',
]

const props = withDefaults(defineProps<{ defaultInterviewId?: string | null }>(), {
  defaultInterviewId: null,
})
const emit = defineEmits<{ submit: [payload: QuestionInput] }>()

function blankForm(): QuestionInput {
  return {
    interviewId: props.defaultInterviewId,
    content: '',
    category: 'tech',
    tags: [],
    difficulty: 3,
    myAnswer: '',
    idealAnswer: '',
    lesson: '',
    selfRating: 3,
    mastery: 'unknown',
  }
}

const form = reactive<QuestionInput>(blankForm())

function submit(): void {
  if (!form.content.trim()) {
    ElMessage.warning('题目内容不能为空')
    return
  }
  emit('submit', {
    ...form,
    content: form.content.trim(),
    tags: [...form.tags],
    interviewId: props.defaultInterviewId,
  })
  Object.assign(form, blankForm())
}
</script>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.form-actions .muted {
  font-size: 12px;
}
</style>
