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
