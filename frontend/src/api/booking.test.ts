import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingApi } from './booking'

const venueInput = {
  name: '新场地', location: '教学楼 3 层', capacity: 12,
  open_time: '08:00', close_time: '20:00', status: 'OPEN',
}

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
  it('按公共契约创建场地并校验服务端响应', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 21, ...venueInput }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(bookingApi.createVenue(venueInput)).resolves.toMatchObject({ id: 21, name: '新场地' })
    expect(fetchMock).toHaveBeenCalledWith('/api/venues', expect.objectContaining({
      method: 'POST', body: JSON.stringify(venueInput),
    }))
  })

  it('场地创建响应状态码或内容不符时不报告成功', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 21, ...venueInput }, { status: 200 })))
    await expect(bookingApi.createVenue(venueInput)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 21, ...venueInput, status: 'CLOSED' }, { status: 201 })))
    await expect(bookingApi.createVenue(venueInput)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('创建预约必须收到契约规定的 201 状态码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(reservation, { status: 200 })))
    await expect(bookingApi.createReservation(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('取消预约必须收到契约规定的 200 状态码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ...reservation, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00',
    }, { status: 201 })))
    await expect(bookingApi.cancelReservation(12)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

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
