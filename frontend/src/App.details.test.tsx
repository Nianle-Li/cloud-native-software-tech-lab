import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const venue = { id: 1, name: '羽毛球馆 A', location: '体育中心 1 层', capacity: 8, open_time: '08:00', close_time: '22:00', status: 'OPEN' }
const reservation = {
  id: 12, venue_id: 1, booked_by: '软件技术小组', reservation_date: '2030-10-30',
  start_time: '10:00', end_time: '11:00', attendee_count: 3, purpose: '小组活动',
  status: 'CANCELLED', created_at: '2030-10-01T10:00:00+08:00', cancelled_at: '2030-10-02T10:00:00+08:00',
}

beforeEach(() => window.history.replaceState(null, '', '/#/'))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('可直接访问的详情面板', () => {
  it('场地列表中的详情入口使用场地详情 API，直接地址和刷新均可查看完整信息', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => {
      if (String(path) === '/api/venues') return Response.json([venue])
      if (String(path) === '/api/venues/1') return Response.json(venue)
      if (String(path) === '/api/reservations') return Response.json([])
      throw new Error(`Unexpected request: ${String(path)}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { unmount } = render(<App />)
    await user.click(await screen.findByRole('link', { name: '查看羽毛球馆 A详情' }))
    expect(window.location.hash).toBe('#/venues/1')
    const detail = await screen.findByRole('dialog', { name: '场地详情' })
    expect(within(detail).getByRole('heading', { level: 2, name: '羽毛球馆 A' })).toHaveFocus()
    expect(within(detail).getByText('体育中心 1 层')).toBeInTheDocument()
    expect(within(detail).getByText('场地编号').nextElementSibling).toHaveTextContent('1')
    expect(within(detail).getByRole('link', { name: '预约此场地' })).toHaveAttribute('href', '#/venues/1/book')
    expect(fetchMock).toHaveBeenCalledWith('/api/venues/1', undefined)
    unmount()
    render(<App />)
    expect(within(await screen.findByRole('dialog', { name: '场地详情' })).getByText('体育中心 1 层')).toBeInTheDocument()
  })

  it('预约详情从独立 API 读取并显示场地编号、状态和时间戳', async () => {
    window.history.replaceState(null, '', '/#/reservations/12')
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => {
      if (String(path) === '/api/venues') return Response.json([venue])
      if (String(path) === '/api/reservations') return Response.json([reservation])
      if (String(path) === '/api/reservations/12') return Response.json(reservation)
      throw new Error(`Unexpected request: ${String(path)}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    const detail = await screen.findByRole('dialog', { name: '预约详情' })
    expect(within(detail).getByRole('heading', { level: 2, name: '预约 #12' })).toBeInTheDocument()
    expect(within(detail).getByText('羽毛球馆 A（编号 1）')).toBeInTheDocument()
    expect(within(detail).getByText('已取消')).toBeInTheDocument()
    expect(within(detail).getByText('2030-10-01T10:00:00+08:00')).toBeInTheDocument()
    expect(within(detail).getByText('2030-10-02T10:00:00+08:00')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/reservations/12', undefined)
  })

  it('场地列表不可用时预约详情仍显示确定的场地编号', async () => {
    window.history.replaceState(null, '', '/#/reservations/12')
    vi.stubGlobal('fetch', vi.fn(async (path: RequestInfo | URL) => {
      if (String(path) === '/api/venues') return Response.json({ error: { code: 'INTERNAL_ERROR', message: '暂时无法查询场地' } }, { status: 503 })
      if (String(path) === '/api/reservations') return Response.json([reservation])
      if (String(path) === '/api/reservations/12') return Response.json(reservation)
      throw new Error(`Unexpected request: ${String(path)}`)
    }))
    render(<App />)
    const detail = await screen.findByRole('dialog', { name: '预约详情' })
    expect(within(detail).getByRole('link', { name: '编号 1' })).toHaveAttribute('href', '#/venues/1')
    expect(within(detail).queryByText(/未知场地/)).not.toBeInTheDocument()
  })

  it('不存在的详情显示服务端错误，刷新后可恢复；停用场地不提供预约入口', async () => {
    window.history.replaceState(null, '', '/#/venues/1')
    let detailCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (path: RequestInfo | URL) => {
      if (String(path) === '/api/venues') return Response.json([venue])
      if (String(path) === '/api/venues/1') return ++detailCalls === 1
        ? Response.json({ error: { code: 'VENUE_NOT_FOUND', message: '场地不存在' } }, { status: 404 })
        : Response.json({ ...venue, status: 'CLOSED' })
      if (String(path) === '/api/reservations') return Response.json([])
      throw new Error(`Unexpected request: ${String(path)}`)
    }))
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('场地不存在')
    await user.click(screen.getByRole('button', { name: '刷新场地详情' }))
    expect(await screen.findByText('已停用')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '预约此场地' })).not.toBeInTheDocument()
  })
})
