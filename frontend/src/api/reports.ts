import { ApiError, requestJson } from './client'

export type ReportSource = 'MANUAL' | 'SCHEDULED'
export type ReportStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export interface ReportItem {
  venue_id: number
  venue_name: string
  reservation_count: number
  reserved_minutes: number
}

export interface Report {
  job_id: string
  source: ReportSource
  start_date: string
  end_date: string
  status: ReportStatus
  started_at: string
  finished_at: string | null
  generated_at: string | null
  error_summary: string | null
  items: ReportItem[]
}

const jobIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const reportQueryTimeoutMs = 15_000

export function isReportJobId(value: string): boolean {
  return jobIdPattern.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isBeijingTimestamp(value: unknown): value is string {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?\+08:00$/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
    && new Date(timestamp + 8 * 60 * 60_000).toISOString().slice(0, 19) === value.slice(0, 19)
}

function isReportItem(value: unknown): value is ReportItem {
  return isRecord(value)
    && typeof value.venue_id === 'number' && Number.isSafeInteger(value.venue_id) && value.venue_id > 0
    && typeof value.venue_name === 'string' && value.venue_name.trim().length > 0
    && typeof value.reservation_count === 'number' && Number.isSafeInteger(value.reservation_count) && value.reservation_count >= 0
    && typeof value.reserved_minutes === 'number' && Number.isSafeInteger(value.reserved_minutes) && value.reserved_minutes >= 0
}

function isReport(value: unknown, jobId: string): value is Report {
  if (!isRecord(value)
    || value.job_id !== jobId
    || (value.source !== 'MANUAL' && value.source !== 'SCHEDULED')
    || !isCalendarDate(value.start_date) || !isCalendarDate(value.end_date)
    || value.start_date > value.end_date
    || !isBeijingTimestamp(value.started_at)
    || !Array.isArray(value.items)
    || !value.items.every(isReportItem)
    || value.items.some((item, index, items) => index > 0 && items[index - 1].venue_id >= item.venue_id)) return false

  if (value.status === 'RUNNING') {
    return value.finished_at === null && value.generated_at === null
      && value.error_summary === null && value.items.length === 0
  }
  if (value.status === 'SUCCEEDED') {
    return isBeijingTimestamp(value.finished_at)
      && isBeijingTimestamp(value.generated_at) && value.error_summary === null
  }
  if (value.status === 'FAILED') {
    return isBeijingTimestamp(value.finished_at) && value.generated_at === null
      && typeof value.error_summary === 'string' && value.error_summary.trim().length > 0
      && value.items.length === 0
  }
  return false
}

export const reportApi = {
  async get(jobId: string): Promise<Report> {
    if (!isReportJobId(jobId)) {
      throw new ApiError('Job ID 格式无效，请输入 1 至 63 位小写字母、数字或连字符', 400, 'VALIDATION_ERROR')
    }
    const controller = new AbortController()
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, reportQueryTimeoutMs)
    try {
      const body = await requestJson<unknown>(`/reports/${jobId}`, { signal: controller.signal }, 200)
      if (!isReport(body, jobId)) {
        throw new ApiError('报告接口返回无效数据，请稍后重试', 200, 'INVALID_RESPONSE')
      }
      return body
    } catch (error) {
      if (timedOut) throw new ApiError('报告查询超时', 0, 'TIMEOUT')
      throw error
    } finally {
      window.clearTimeout(timeout)
    }
  },
}
