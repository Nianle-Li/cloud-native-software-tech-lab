import { createServer } from 'node:http'

// Only the endpoints used by the frontend are simulated; data remains in memory.
const seedVenues = [
  {
    id: 1,
    name: '羽毛球馆 A',
    location: '体育中心 1 层',
    capacity: 8,
    open_time: '08:00',
    close_time: '22:00',
    status: 'OPEN',
  },
  {
    id: 2,
    name: '多功能教室 B',
    location: '教学楼 2 层',
    capacity: 30,
    open_time: '09:00',
    close_time: '21:00',
    status: 'OPEN',
  },
  {
    id: 3,
    name: '维护中的场地 C',
    location: '体育中心 2 层',
    capacity: 12,
    open_time: '08:00',
    close_time: '20:00',
    status: 'CLOSED',
  },
]

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function fail(response, status, code, message) {
  send(response, status, { error: { code, message } })
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('请求正文过大')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function shanghaiDateTime(now) {
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

function validInput(input, venue, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const date = input.reservation_date
  const start = input.start_time
  const end = input.end_time
  if (!isCalendarDate(date)) return false
  const current = shanghaiDateTime(now)
  return input.venue_id === venue.id
    && typeof input.booked_by === 'string' && input.booked_by.trim().length > 0 && input.booked_by.trim().length <= 100
    && typeof input.purpose === 'string' && input.purpose.trim().length > 0 && input.purpose.trim().length <= 500
    && typeof start === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(start)
    && typeof end === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(end)
    && date >= current.date && (date !== current.date || start > current.time)
    && start < end && start >= venue.open_time && end <= venue.close_time
    && Number.isInteger(input.attendee_count)
    && input.attendee_count >= 1 && input.attendee_count <= venue.capacity
}

function validVenueInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/
  return typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 100
    && typeof input.location === 'string' && input.location.trim().length > 0 && input.location.length <= 200
    && Number.isInteger(input.capacity) && input.capacity >= 1 && input.capacity <= 2147483647
    && typeof input.open_time === 'string' && timePattern.test(input.open_time)
    && typeof input.close_time === 'string' && timePattern.test(input.close_time)
    && input.open_time < input.close_time
    && (input.status === undefined || input.status === null || input.status === 'OPEN' || input.status === 'CLOSED')
}

export function createMockApiServer({ now = () => new Date() } = {}) {
  const venues = seedVenues.map((venue) => ({ ...venue }))
  const reservations = []
  let nextId = 1
  let nextVenueId = Math.max(...venues.map((venue) => venue.id)) + 1

  return createServer((request, response) => {
    async function handle() {
      const path = new URL(request.url, 'http://127.0.0.1').pathname

      if (request.method === 'GET' && path === '/api/venues') {
        send(response, 200, venues)
        return
      }
      const venueDetail = /^\/api\/venues\/(\d+)$/.exec(path)
      if (request.method === 'GET' && venueDetail) {
        const venue = venues.find((item) => item.id === Number(venueDetail[1]))
        if (venue) send(response, 200, venue)
        else fail(response, 404, 'VENUE_NOT_FOUND', '场地不存在')
        return
      }
      if (request.method === 'POST' && path === '/api/venues') {
        let input
        try {
          input = await readJson(request)
        } catch {
          fail(response, 400, 'VALIDATION_ERROR', '请求正文必须是有效的 JSON')
          return
        }
        if (!validVenueInput(input)) {
          fail(response, 400, 'VALIDATION_ERROR', '请检查场地名称、位置、容量、开放时段和状态')
          return
        }
        const created = {
          id: nextVenueId++,
          name: input.name,
          location: input.location,
          capacity: input.capacity,
          open_time: input.open_time,
          close_time: input.close_time,
          status: input.status ?? 'OPEN',
        }
        venues.push(created)
        send(response, 201, created)
        return
      }
      if (request.method === 'GET' && path === '/api/reservations') {
        send(response, 200, [...reservations].reverse())
        return
      }
      const reservationDetail = /^\/api\/reservations\/(\d+)$/.exec(path)
      if (request.method === 'GET' && reservationDetail) {
        const reservation = reservations.find((item) => item.id === Number(reservationDetail[1]))
        if (reservation) send(response, 200, reservation)
        else fail(response, 404, 'RESERVATION_NOT_FOUND', '预约不存在')
        return
      }
      if (request.method === 'POST' && path === '/api/reservations') {
        let input
        try {
          input = await readJson(request)
        } catch {
          fail(response, 400, 'VALIDATION_ERROR', '请求正文必须是有效的 JSON')
          return
        }
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          fail(response, 400, 'VALIDATION_ERROR', '请求正文必须是预约对象')
          return
        }
        const venue = venues.find((item) => item.id === input.venue_id)
        if (!venue) {
          fail(response, 404, 'VENUE_NOT_FOUND', '场地不存在')
          return
        }
        if (venue.status !== 'OPEN') {
          fail(response, 409, 'VENUE_CLOSED', '该场地已停用')
          return
        }
        if (!validInput(input, venue, now())) {
          fail(response, 400, 'VALIDATION_ERROR', '请检查预约信息和开放时段')
          return
        }
        if (reservations.some((item) => item.status === 'ACTIVE'
          && item.venue_id === venue.id
          && item.reservation_date === input.reservation_date
          && input.start_time < item.end_time && input.end_time > item.start_time)) {
          fail(response, 409, 'TIME_CONFLICT', '该场地在所选时段已被预约')
          return
        }
        const created = {
          ...input,
          id: nextId++,
          status: 'ACTIVE',
          created_at: now().toISOString(),
          cancelled_at: null,
        }
        reservations.push(created)
        send(response, 201, created)
        return
      }

      const cancel = /^\/api\/reservations\/(\d+)\/cancel$/.exec(path)
      if (request.method === 'POST' && cancel) {
        const reservation = reservations.find((item) => item.id === Number(cancel[1]))
        if (!reservation) {
          fail(response, 404, 'RESERVATION_NOT_FOUND', '预约不存在')
          return
        }
        if (reservation.status === 'ACTIVE') {
          reservation.status = 'CANCELLED'
          reservation.cancelled_at = now().toISOString()
        }
        send(response, 200, reservation)
        return
      }

      fail(response, 404, 'NOT_FOUND', '接口不存在')
    }

    handle().catch(() => {
      if (!response.headersSent) fail(response, 500, 'INTERNAL_ERROR', '模拟服务暂时不可用')
    })
  })
}
