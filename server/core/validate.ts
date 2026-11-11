import type { ZodType } from 'zod'
import { ERROR_CODES } from '../../shared/api'
import { AppError } from '../errors/app-error'

/**
 * 边界输入校验：永远不要信任客户端数据。
 * Controller 拿到 body / query / params 后先过这一层，再交给 service。
 */
export function validate<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }))
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 400, '请求参数不合法', details)
  }
  return result.data
}
