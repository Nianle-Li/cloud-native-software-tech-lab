import { describe, expect, it } from 'vitest'
import { reservationPhase } from './reservationPhase'

const reservation = {
  status: 'ACTIVE' as const,
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
}

describe('预约时段进度', () => {
  it('按北京时间判断开始和结束边界，结束时刻不再视为时段内', () => {
    expect(reservationPhase(reservation, new Date('2030-10-29T15:59:00Z'))).toBe('UPCOMING')
    expect(reservationPhase(reservation, new Date('2030-10-30T01:59:59Z'))).toBe('UPCOMING')
    expect(reservationPhase(reservation, new Date('2030-10-30T02:00:00Z'))).toBe('IN_PROGRESS')
    expect(reservationPhase(reservation, new Date('2030-10-30T02:59:59Z'))).toBe('IN_PROGRESS')
    expect(reservationPhase(reservation, new Date('2030-10-30T03:00:00Z'))).toBe('ENDED')
    expect(reservationPhase(reservation, new Date('2030-10-30T16:00:00Z'))).toBe('ENDED')
  })

  it('已取消优先于时间进度', () => {
    expect(reservationPhase({ ...reservation, status: 'CANCELLED' }, new Date('2030-10-30T02:30:00Z'))).toBe('CANCELLED')
  })
})
