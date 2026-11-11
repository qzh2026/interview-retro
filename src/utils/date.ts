import type { ISODate, ISODateTime } from '@/types'

export function nowISO(): ISODateTime {
  return new Date().toISOString()
}

/** 本地时区的 YYYY-MM-DD（不要用 toISOString，会差 8 小时） */
export function todayISO(): ISODate {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 字符串日期可直接比较，先出现的更小 */
export function isDue(date: ISODate | null, today: ISODate = todayISO()): boolean {
  return date !== null && date <= today
}

export function formatDateTime(value: ISODateTime | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}
