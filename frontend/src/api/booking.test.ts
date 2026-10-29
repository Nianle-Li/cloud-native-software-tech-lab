import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingApi } from './booking'
import type { CreateVenueInput } from '../types'

const venueInput: CreateVenueInput = {
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
  it('按编号查询场地和预约详情，并拒绝编号不符的响应', async () => {
    const fetchedVenue = { id: 1, ...venueInput }
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => Response.json(
      String(path) === '/api/venues/1' ? fetchedVenue : reservation,
    ))
    vi.stubGlobal('fetch', fetchMock)
    await expect(bookingApi.getVenue(1)).resolves.toEqual(fetchedVenue)
    await expect(bookingApi.getReservation(12)).resolves.toEqual(reservation)
    expect(fetchMock).toHaveBeenCalledWith('/api/venues/1', undefined)
    expect(fetchMock).toHaveBeenCalledWith('/api/reservations/12', undefined)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...reservation, id: 99 })))
    await expect(bookingApi.getReservation(12)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it.each([
    ['场地列表不是数组', 'venues', { id: 1, ...venueInput }],
    ['场地列表含无效容量', 'venues', [{ id: 1, ...venueInput, capacity: 0 }]],
    ['预约列表不是数组', 'reservations', reservation],
    ['预约列表中取消状态与时间不一致', 'reservations', [{ ...reservation, status: 'CANCELLED', cancelled_at: null }]],
  ])('%s时拒绝整份列表', async (_description, resource, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    const result = resource === 'venues' ? bookingApi.listVenues() : bookingApi.listReservations()
    await expect(result).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

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
    [{ ...reservation, booked_by: '其他用户' }, '预约人不匹配'],
    [{ ...reservation, purpose: '其他用途' }, '用途不匹配'],
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
