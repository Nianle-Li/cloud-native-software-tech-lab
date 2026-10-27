import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingApi } from './booking'

const input = {
  venue_id: 1,
  booked_by: '测试小组',
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 2,
  purpose: '团队活动',
}

const reservation = {
  id: 12,
  ...input,
  status: 'ACTIVE',
  created_at: '2030-10-01T10:00:00+08:00',
  cancelled_at: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('预约 API 的成功响应校验', () => {
  it.each([
    [{ ...reservation, venue_id: 2 }, '场地不匹配'],
    [{ ...reservation, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' }, '状态不匹配'],
    [{ ...reservation, id: 0 }, '无效编号'],
  ])('创建响应出现%s时不报告成功：%s', async (body, _reason) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status: 201 })))
    await expect(bookingApi.createReservation(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it.each([
    [{ ...reservation, status: 'ACTIVE' }, '状态仍有效'],
    [{ ...reservation, id: 13, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' }, '编号不匹配'],
  ])('取消响应出现%s时不报告成功：%s', async (body, _reason) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    await expect(bookingApi.cancelReservation(12)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
