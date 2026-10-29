import type { CreateReservationInput, Venue } from '../types'

export interface ValidationIssue {
  field: keyof CreateReservationInput
  message: string
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function shanghaiDateTime(now: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  }
}

export function validateReservation(
  input: CreateReservationInput,
  venue: Venue,
  now: Date = new Date(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const add = (field: ValidationIssue['field'], message: string) => {
    if (!issues.some((issue) => issue.field === field)) issues.push({ field, message })
  }

  if (input.venue_id !== venue.id || venue.status !== 'OPEN') {
    add('venue_id', '场地当前不可预约，请刷新场地信息并核对状态')
  }
  const bookedBy = input.booked_by.trim()
  if (!bookedBy || bookedBy.length > 100) add('booked_by', '预约人或组织须为 1–100 个字符')
  const purpose = input.purpose.trim()
  if (!purpose || purpose.length > 500) add('purpose', '使用目的须为 1–500 个字符')

  const dateValid = isCalendarDate(input.reservation_date)
  if (!dateValid) add('reservation_date', '请选择有效的预约日期')
  const startValid = timePattern.test(input.start_time)
  const endValid = timePattern.test(input.end_time)
  if (!startValid) add('start_time', '请选择有效的开始时间')
  if (!endValid) add('end_time', '请选择有效的结束时间')

  if (dateValid) {
    const current = shanghaiDateTime(now)
    if (input.reservation_date < current.date) add('reservation_date', '预约日期不能早于今天')
    if (input.reservation_date === current.date && startValid && input.start_time <= current.time) {
      add('start_time', '今天的开始时间必须晚于当前时间')
    }
  }
  if (startValid && input.start_time < venue.open_time) add('start_time', '开始时间不能早于场地开放时间')
  if (endValid && input.end_time > venue.close_time) add('end_time', '结束时间不能晚于场地关闭时间')
  if (startValid && endValid && input.start_time >= input.end_time) {
    add('end_time', '结束时间必须晚于开始时间')
  }
  if (!Number.isInteger(input.attendee_count) || input.attendee_count < 1 || input.attendee_count > venue.capacity) {
    add('attendee_count', `参与人数须为 1–${venue.capacity} 的整数`)
  }

  return issues
}
