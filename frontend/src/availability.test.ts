import { describe, expect, it } from 'vitest'
import { bookedSlotsForDate, isFullyBooked, overlapsBookedSlot } from './availability'
import type { Reservation } from './types'

const reservation: Reservation = {
  id: 1,
  venue_id: 1,
  booked_by: '测试小组',
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 3,
  purpose: '小组活动',
  status: 'ACTIVE',
  created_at: '2030-10-01T10:00:00+08:00',
  cancelled_at: null,
}

describe('预约时段展示', () => {
  it('仅使用所选场地和日期的有效预约，并按开始时间排序', () => {
    const slots = bookedSlotsForDate([
      { ...reservation, id: 2, start_time: '12:00', end_time: '13:00' },
      { ...reservation, id: 3, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' },
      { ...reservation, id: 4, venue_id: 2 },
      { ...reservation, id: 5, reservation_date: '2030-10-31' },
      reservation,
    ], 1, '2030-10-30')
    expect(slots).toEqual([
      { startTime: '10:00', endTime: '11:00' },
      { startTime: '12:00', endTime: '13:00' },
    ])
  })

  it('相邻时段不冲突，真正重叠才提示占用', () => {
    const slots = [{ startTime: '10:00', endTime: '11:00' }]
    expect(overlapsBookedSlot(slots, '09:00', '10:00')).toBe(false)
    expect(overlapsBookedSlot(slots, '11:00', '12:00')).toBe(false)
    expect(overlapsBookedSlot(slots, '10:30', '11:30')).toBe(true)
  })

  it('只有预约覆盖整个开放时段时才显示已约满', () => {
    expect(isFullyBooked([
      { startTime: '08:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '22:00' },
    ], '08:00', '22:00')).toBe(true)
    expect(isFullyBooked([
      { startTime: '08:00', endTime: '10:00' },
      { startTime: '10:30', endTime: '22:00' },
    ], '08:00', '22:00')).toBe(false)
  })
})
