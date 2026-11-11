import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

/**
 * 使用 hash 路由：纯静态托管（含直接双击 dist/index.html）时不需要服务端 rewrite 规则。
 * 若后续部署到支持 SPA fallback 的平台，可换成 createWebHistory。
 */
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    // 命名父路由：插件通过 router.addRoute('root', ...) 注入自己的页面
    name: 'root',
    component: AppLayout,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '总览' },
      },
      {
        path: 'interviews',
        name: 'interviews',
        component: () => import('@/views/InterviewListView.vue'),
        meta: { title: '面试场次' },
      },
      {
        path: 'interviews/:id',
        name: 'interview-detail',
        component: () => import('@/views/InterviewDetailView.vue'),
        meta: { title: '场次详情' },
      },
      {
        path: 'questions',
        name: 'questions',
        component: () => import('@/views/QuestionListView.vue'),
        meta: { title: '题目复盘' },
      },
      {
        path: 'questions/:id',
        name: 'question-detail',
        component: () => import('@/views/QuestionDetailView.vue'),
        meta: { title: '单题复盘' },
      },
      {
        path: 'review',
        name: 'review',
        component: () => import('@/views/ReviewView.vue'),
        meta: { title: '今日复习' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '数据与备份' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.afterEach((to) => {
  document.title = `${to.meta.title ?? '面经复盘'} · 面经复盘`
})

export default router
