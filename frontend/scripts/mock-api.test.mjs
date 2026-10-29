// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMockApiServer } from './mock-api-core.mjs'

const booking = {
  venue_id: 1,
  booked_by: '软件技术小组',
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 3,
  purpose: '小组活动',
}

let server
let baseUrl

beforeEach(async () => {
  server = createMockApiServer({ now: () => new Date('2026-10-26T01:30:30Z') })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('模拟 API 未监听 TCP 端口')
  baseUrl = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('本地模拟 API 与预约契约', () => {
  it('按编号查询两类详情，不存在时返回明确的 404', async () => {
    const venueResponse = await fetch(`${baseUrl}/api/venues/1`)
    expect(venueResponse.status).toBe(200)
    expect(await venueResponse.json()).toMatchObject({ id: 1, name: '羽毛球馆 A' })
    const created = await post('/api/reservations', booking)
    expect(created.status).toBe(201)
    const reservation = await created.json()
    const detailResponse = await fetch(`${baseUrl}/api/reservations/${reservation.id}`)
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual(reservation)
    const missingVenue = await fetch(`${baseUrl}/api/venues/999`)
    expect(missingVenue.status).toBe(404)
    expect((await missingVenue.json()).error.code).toBe('VENUE_NOT_FOUND')
    const missingReservation = await fetch(`${baseUrl}/api/reservations/999`)
    expect(missingReservation.status).toBe(404)
    expect((await missingReservation.json()).error.code).toBe('RESERVATION_NOT_FOUND')
  })
  it('创建场地返回 201 和编号，默认开放，并可通过列表查询及预约', async () => {
    const input = { name: '排练室', location: '教学楼', capacity: 20, open_time: '09:00', close_time: '21:00' }
    const response = await post('/api/venues', input)
    expect(response.status).toBe(201)
    const venue = await response.json()
    expect(venue).toEqual({ ...input, id: 4, status: 'OPEN' })
    const listResponse = await fetch(`${baseUrl}/api/venues`)
    expect(await listResponse.json()).toContainEqual(venue)
    const reservation = await post('/api/reservations', { ...booking, venue_id: venue.id })
    expect(reservation.status).toBe(201)
    const second = await post('/api/venues', { ...input, status: 'CLOSED' })
    expect(second.status).toBe(201)
    const closedVenue = await second.json()
    expect(closedVenue).toMatchObject({ id: 5, status: 'CLOSED' })
    const closedReservation = await post('/api/reservations', { ...booking, venue_id: closedVenue.id })
    expect(closedReservation.status).toBe(409)
    expect((await closedReservation.json()).error.code).toBe('VENUE_CLOSED')
  })

  it.each([
    null, [], {},
    { name: ' ' }, { name: '甲'.repeat(101) },
    { location: '\t' }, { location: '乙'.repeat(201) },
    { capacity: 0 }, { capacity: 1.5 }, { capacity: 2147483648 }, { capacity: '20' },
    { open_time: '25:00' }, { close_time: '09:00' }, { close_time: '08:00' },
    { status: 'INVALID' },
  ])('拒绝无效场地输入 %j，且不写入模拟列表', async (invalid) => {
    const valid = { name: '排练室', location: '教学楼', capacity: 20, open_time: '09:00', close_time: '21:00' }
    const input = invalid && !Array.isArray(invalid) && Object.keys(invalid).length ? { ...valid, ...invalid } : invalid
    const response = await post('/api/venues', input)
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
    const list = await fetch(`${baseUrl}/api/venues`)
    expect(await list.json()).toHaveLength(3)
  })

  it('创建场地拒绝无效 JSON', async () => {
    const response = await fetch(`${baseUrl}/api/venues`, { method: 'POST', body: '{' })
    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR')
  })

  it('拒绝过去日期和停用场地', async () => {
    const venuesResponse = await fetch(`${baseUrl}/api/venues`)
    const venues = await venuesResponse.json()
    expect(venuesResponse.status).toBe(200)
    const closedVenue = venues.find((venue) => venue.status === 'CLOSED')
    expect(closedVenue).toBeDefined()

    const pastResponse = await post('/api/reservations', { ...booking, reservation_date: '2026-10-25' })
    expect(pastResponse.status).toBe(400)
    expect((await pastResponse.json()).error.code).toBe('VALIDATION_ERROR')

    const closedResponse = await post('/api/reservations', { ...booking, venue_id: closedVenue.id })
    expect(closedResponse.status).toBe(409)
    expect((await closedResponse.json()).error.code).toBe('VENUE_CLOSED')
  })

  it('拒绝重叠时段，重复取消幂等，取消后可再次预约', async () => {
    const createdResponse = await post('/api/reservations', booking)
    expect(createdResponse.status).toBe(201)
    const created = await createdResponse.json()

    const conflictResponse = await post('/api/reservations', booking)
    expect(conflictResponse.status).toBe(409)
    expect((await conflictResponse.json()).error.code).toBe('TIME_CONFLICT')

    const cancelPath = `/api/reservations/${created.id}/cancel`
    const cancelResponse = await fetch(`${baseUrl}${cancelPath}`, { method: 'POST' })
    expect(cancelResponse.status).toBe(200)
    const cancelled = await cancelResponse.json()
    expect(cancelled.status).toBe('CANCELLED')

    const repeatCancelResponse = await fetch(`${baseUrl}${cancelPath}`, { method: 'POST' })
    expect(repeatCancelResponse.status).toBe(200)
    expect(await repeatCancelResponse.json()).toEqual(cancelled)

    const rebookResponse = await post('/api/reservations', booking)
    expect(rebookResponse.status).toBe(201)
  })
})
