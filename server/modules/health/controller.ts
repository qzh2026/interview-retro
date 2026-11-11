import type { FastifyInstance } from 'fastify'
import type { HealthService } from './service'

/** 控制器：只负责注册路由、调用服务、返回数据，不写业务逻辑与错误处理 */
export function registerHealthRoutes(app: FastifyInstance, service: HealthService): void {
  app.get('/health', async () => service.liveness())
  app.get('/ready', async () => service.readiness())
}
