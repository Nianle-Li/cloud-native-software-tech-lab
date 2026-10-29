import type { CreateVenueInput } from '../types'

export interface VenueValidationIssue {
  field: keyof CreateVenueInput
  message: string
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

export function validateVenue(input: CreateVenueInput): VenueValidationIssue[] {
  const issues: VenueValidationIssue[] = []
  if (!input.name.trim() || input.name.trim().length > 100) {
    issues.push({ field: 'name', message: '场地名称须为 1–100 个字符' })
  }
  if (!input.location.trim() || input.location.trim().length > 200) {
    issues.push({ field: 'location', message: '所在位置须为 1–200 个字符' })
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 2147483647) {
    issues.push({ field: 'capacity', message: '可容纳人数须为正整数' })
  }
  const openValid = timePattern.test(input.open_time)
  const closeValid = timePattern.test(input.close_time)
  if (!openValid) issues.push({ field: 'open_time', message: '请选择有效的开放时间' })
  if (!closeValid) issues.push({ field: 'close_time', message: '请选择有效的关闭时间' })
  if (openValid && closeValid && input.open_time >= input.close_time) {
    issues.push({ field: 'close_time', message: '关闭时间必须晚于开放时间' })
  }
  if (input.status !== undefined && input.status !== 'OPEN' && input.status !== 'CLOSED') {
    issues.push({ field: 'status', message: '场地状态无效' })
  }
  return issues
}
