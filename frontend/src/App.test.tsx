import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const venue = {
  id: 1,
  name: '羽毛球馆 A',
  location: '体育中心 1 层',
  capacity: 8,
  open_time: '08:00',
  close_time: '22:00',
  status: 'OPEN',
}

const reservation = {
  id: 12,
  venue_id: 1,
  booked_by: '软件技术小组',
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 3,
  purpose: '小组活动',
  status: 'ACTIVE',
  created_at: '2030-10-01T10:00:00+08:00',
  cancelled_at: null,
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('场地预约页面', () => {
  it('加载场地后可创建预约并显示服务端返回的记录', async () => {
    const user = userEvent.setup()
    let reservations: unknown[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && (!init || init.method === 'GET')) return json(reservations)
      if (path === '/api/reservations' && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          venue_id: 1,
          booked_by: '软件技术小组',
          reservation_date: '2030-10-30',
          start_time: '10:00',
          end_time: '11:00',
          attendee_count: 3,
          purpose: '小组活动',
        })
        reservations = [reservation]
        return json(reservation, 201)
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('羽毛球馆 A')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '查看羽毛球馆 A详情' }))
    expect(screen.getByText('体育中心 1 层')).toBeInTheDocument()

    const form = screen.getByRole('form', { name: '创建预约' })
    await user.type(within(form).getByLabelText('预约人或组织'), '软件技术小组')
    await user.type(within(form).getByLabelText('预约日期'), '2030-10-30')
    await user.type(within(form).getByLabelText('开始时间'), '10:00')
    await user.type(within(form).getByLabelText('结束时间'), '11:00')
    await user.clear(within(form).getByLabelText('参与人数'))
    await user.type(within(form).getByLabelText('参与人数'), '3')
    await user.type(within(form).getByLabelText('使用目的'), '小组活动')
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByText('预约成功，编号 12')).toBeInTheDocument()
    expect(await screen.findByText('软件技术小组')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reservations',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('显示后端返回的冲突错误，不伪造预约成功', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations' && !init) return json([])
      if (path === '/api/reservations' && init?.method === 'POST') {
        return json({ error: { code: 'TIME_CONFLICT', message: '该场地在所选时段已被预约' } }, 409)
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    const form = await screen.findByRole('form', { name: '创建预约' })
    await user.type(within(form).getByLabelText('预约人或组织'), '软件技术小组')
    await user.type(within(form).getByLabelText('预约日期'), '2030-10-30')
    await user.type(within(form).getByLabelText('开始时间'), '10:00')
    await user.type(within(form).getByLabelText('结束时间'), '11:00')
    await user.type(within(form).getByLabelText('使用目的'), '小组活动')
    await user.click(within(form).getByRole('button', { name: '提交预约' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('该场地在所选时段已被预约')
    expect(screen.queryByText(/预约成功，编号/)).not.toBeInTheDocument()
  })

  it('取消预约后显示服务端确认的状态', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') return json([reservation])
      if (path === '/api/reservations/12/cancel' && init?.method === 'POST') {
        return json({ ...reservation, status: 'CANCELLED', cancelled_at: '2030-10-01T11:00:00+08:00' })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    expect(await screen.findByText('软件技术小组')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消预约 12' }))
    expect(await screen.findByText('已取消')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reservations/12/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('API 返回错误结构时显示错误，不崩溃', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/venues') return json({ unexpected: true })
      if (String(input) === '/api/reservations') return json([])
      throw new Error('Unexpected request')
    }))

    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('服务器返回了无效数据')
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
  })

  it('场地停用时显示状态且不提供预约表单', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/venues') return json([{ ...venue, status: 'CLOSED' }])
      if (String(input) === '/api/reservations') return json([])
      throw new Error('Unexpected request')
    }))

    render(<App />)
    expect(await screen.findByText('该场地已停用，无法预约。')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
  })

  it('取消失败时保留原状态并显示服务端错误', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/venues') return json([venue])
      if (path === '/api/reservations') return json([reservation])
      if (path === '/api/reservations/12/cancel' && init?.method === 'POST') {
        return json({ error: { code: 'RESERVATION_NOT_FOUND', message: '预约不存在' } }, 404)
      }
      throw new Error(`Unexpected request: ${path}`)
    }))

    render(<App />)
    await user.click(await screen.findByRole('button', { name: '取消预约 12' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('预约不存在')
    expect(screen.getByText('有效')).toBeInTheDocument()
  })
})
