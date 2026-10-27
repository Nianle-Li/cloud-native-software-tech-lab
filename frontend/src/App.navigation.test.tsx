import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const venues = [
  { id: 1, name: '羽毛球馆 A', location: '体育中心 1 层', capacity: 8, open_time: '08:00', close_time: '22:00', status: 'OPEN' },
  { id: 2, name: '维护中的场地 B', location: '教学楼 2 层', capacity: 12, open_time: '09:00', close_time: '21:00', status: 'CLOSED' },
]

beforeEach(() => {
  window.history.replaceState(null, '', '/#/')
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/venues') return Response.json(venues)
    if (String(input) === '/api/reservations') return Response.json([])
    throw new Error(`Unexpected request: ${String(input)}`)
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('独立页面导航', () => {
  it('概览页选择开放场地后进入预约页，记录页独立显示', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { name: '场地列表' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '预约记录' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '预约维护中的场地 B' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '预约羽毛球馆 A' }))
    expect(await screen.findByRole('form', { name: '创建预约' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/venues/1/book')
    expect(screen.queryByRole('heading', { name: '场地列表' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(await screen.findByRole('heading', { name: '预约记录' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '场地列表' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '场地概览' }))
    expect(await screen.findByRole('heading', { name: '场地列表' })).toBeInTheDocument()
  })

  it('直接打开停用或不存在场地的预约地址时不显示表单', async () => {
    window.history.replaceState(null, '', '/#/venues/2/book')
    const { rerender } = render(<App />)
    expect(await screen.findByText('该场地已停用，无法预约。')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()

    window.history.replaceState(null, '', '/#/venues/999/book')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    rerender(<App />)
    expect(await screen.findByText('场地不存在或已从列表移除。')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: '创建预约' })).not.toBeInTheDocument()
  })

  it('从已滚动的概览进入预约页时回到页面顶部', async () => {
    const user = userEvent.setup()
    render(<App />)
    const bookingLink = await screen.findByRole('link', { name: '预约羽毛球馆 A' })
    vi.stubGlobal('scrollY', 650)
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    await user.click(bookingLink)
    expect(await screen.findByRole('heading', { name: '预约 羽毛球馆 A' })).toBeInTheDocument()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' }))
  })

  it('切换页面时更新标题并把键盘焦点移到页面标题', async () => {
    const user = userEvent.setup()
    render(<App />)
    const homeHeading = await screen.findByRole('heading', { level: 1 })
    expect(homeHeading).not.toHaveFocus()
    expect(document.title).toContain('场地概览')

    await user.click(await screen.findByRole('link', { name: '预约羽毛球馆 A' }))
    const bookingHeading = await screen.findByRole('heading', { name: '预约 羽毛球馆 A' })
    expect(bookingHeading).toHaveFocus()
    expect(document.title).toContain('羽毛球馆 A')

    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(screen.getByRole('heading', { name: '预约记录', level: 1 })).toHaveFocus()
    expect(document.title).toContain('预约记录')
  })

  it('再次进入记录页时重新获取其他客户端更新的记录', async () => {
    const user = userEvent.setup()
    let listCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/venues') return Response.json(venues)
      if (String(input) === '/api/reservations') {
        listCalls += 1
        return Response.json(listCalls < 3 ? [] : [{
          id: 42, venue_id: 1, booked_by: '另一位用户', reservation_date: '2030-10-30',
          start_time: '10:00', end_time: '11:00', attendee_count: 2, purpose: '团队活动',
          status: 'ACTIVE', created_at: '2030-10-01T10:00:00+08:00', cancelled_at: null,
        }])
      }
      throw new Error(`Unexpected request: ${String(input)}`)
    }))
    render(<App />)
    await screen.findByRole('heading', { name: '场地列表' })
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(await screen.findByText('暂无预约记录。')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '场地概览' }))
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    expect(await screen.findByText('另一位用户')).toBeInTheDocument()
    expect(listCalls).toBe(3)
  })
})
