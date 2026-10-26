import { describe, expect, it } from 'vitest'
import type { CreateReservationInput, Venue } from '../types'
import { validateReservation } from './reservation'

const venue: Venue = {
  id: 1,
  name: '羽毛球馆 A',
  location: '体育中心 1 层',
  capacity: 8,
  open_time: '08:00',
  close_time: '22:00',
  status: 'OPEN',
}

const valid: CreateReservationInput = {
  venue_id: 1,
  booked_by: '软件技术小组',
  reservation_date: '2026-10-27',
  start_time: '08:00',
  end_time: '22:00',
  attendee_count: 8,
  purpose: '小组活动',
}

// 上海时间 2026-10-26 09:30:30，与运行测试的机器时区无关。
const now = new Date('2026-10-26T01:30:30Z')

function fields(input: CreateReservationInput, selectedVenue = venue): string[] {
  return validateReservation(input, selectedVenue, now).map((issue) => issue.field)
}

describe('预约表单校验', () => {
  it('允许未来日期以及开放时段的两个边界', () => {
    expect(fields(valid)).toEqual([])
  })

  it('拒绝过去日期、无效日历日期和错误日期格式', () => {
    expect(fields({ ...valid, reservation_date: '2026-10-25' })).toContain('reservation_date')
    expect(fields({ ...valid, reservation_date: '2027-02-29' })).toContain('reservation_date')
    expect(fields({ ...valid, reservation_date: '2026/10/27' })).toContain('reservation_date')
  })

  it('按上海时间拒绝今天当前分钟及更早的开始时间', () => {
    expect(fields({ ...valid, reservation_date: '2026-10-26', start_time: '09:30' })).toContain('start_time')
    expect(fields({ ...valid, reservation_date: '2026-10-26', start_time: '09:31' })).toEqual([])
  })

  it('跨 UTC 日期边界时仍按上海日期判断', () => {
    const midnight = new Date('2026-10-25T16:30:00Z') // 上海 10 月 26 日 00:30
    expect(validateReservation({ ...valid, reservation_date: '2026-10-25' }, venue, midnight)
      .map((issue) => issue.field)).toContain('reservation_date')
    expect(validateReservation({ ...valid, reservation_date: '2026-10-26' }, venue, midnight)).toEqual([])
  })

  it('拒绝开始结束颠倒、相同时间和超出开放时段', () => {
    expect(fields({ ...valid, start_time: '11:00', end_time: '10:00' })).toContain('end_time')
    expect(fields({ ...valid, start_time: '10:00', end_time: '10:00' })).toContain('end_time')
    expect(fields({ ...valid, start_time: '07:59' })).toContain('start_time')
    expect(fields({ ...valid, end_time: '22:01' })).toContain('end_time')
  })

  it('拒绝非法人数、空白文字和超长文字', () => {
    expect(fields({ ...valid, attendee_count: 0 })).toContain('attendee_count')
    expect(fields({ ...valid, attendee_count: 9 })).toContain('attendee_count')
    expect(fields({ ...valid, attendee_count: 1.5 })).toContain('attendee_count')
    expect(fields({ ...valid, booked_by: '   ' })).toContain('booked_by')
    expect(fields({ ...valid, purpose: '\t' })).toContain('purpose')
    expect(fields({ ...valid, booked_by: '甲'.repeat(101) })).toContain('booked_by')
    expect(fields({ ...valid, purpose: '乙'.repeat(501) })).toContain('purpose')
  })

  it('拒绝已停用场地或不匹配的场地编号', () => {
    expect(fields(valid, { ...venue, status: 'CLOSED' })).toContain('venue_id')
    expect(fields({ ...valid, venue_id: 2 })).toContain('venue_id')
  })
})
