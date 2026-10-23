import { createServer } from 'node:http'

// Local, in-memory UI fixture. It is not the course backend or a persistence test.
const venues = [
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
]
const reservations = []
let nextId = 1

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

function validInput(input, venue) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const date = input.reservation_date
  const start = input.start_time
  const end = input.end_time
  return typeof input.booked_by === 'string' && input.booked_by.trim().length > 0
    && typeof input.purpose === 'string' && input.purpose.trim().length > 0
    && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    && typeof start === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(start)
    && typeof end === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(end)
    && start < end && start >= venue.open_time && end <= venue.close_time
    && Number.isInteger(input.attendee_count)
    && input.attendee_count >= 1 && input.attendee_count <= venue.capacity
}

const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname

  if (request.method === 'GET' && path === '/api/venues') {
    send(response, 200, venues)
    return
  }
  if (request.method === 'GET' && path === '/api/reservations') {
    send(response, 200, [...reservations].reverse())
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
    const venue = venues.find((item) => item.id === input?.venue_id)
    if (!venue) {
      fail(response, 404, 'VENUE_NOT_FOUND', '场地不存在')
      return
    }
    if (!validInput(input, venue)) {
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
      created_at: new Date().toISOString(),
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
    if (reservation.status === 'CANCELLED') {
      fail(response, 409, 'RESERVATION_ALREADY_CANCELLED', '预约已取消')
      return
    }
    reservation.status = 'CANCELLED'
    reservation.cancelled_at = new Date().toISOString()
    send(response, 200, reservation)
    return
  }

  fail(response, 404, 'NOT_FOUND', '接口不存在')
})

server.listen(8081, '127.0.0.1', () => {
  console.log('本地模拟 API 已启动：http://127.0.0.1:8081（数据仅保存在进程内）')
})
