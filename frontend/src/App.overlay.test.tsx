import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const venue = { id: 1, name: '羽毛球馆 A', location: '体育中心 1 层', capacity: 8, open_time: '08:00', close_time: '22:00', status: 'OPEN' }
const reservation = {
  id: 12, venue_id: 1, booked_by: '软件技术小组', reservation_date: '2030-10-30',
  start_time: '10:00', end_time: '11:00', attendee_count: 3, purpose: '小组活动',
  status: 'ACTIVE', created_at: '2030-10-01T10:00:00+08:00', cancelled_at: null,
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/')
  vi.stubGlobal('fetch', vi.fn(async (path: RequestInfo | URL) => {
    if (String(path) === '/api/venues') return Response.json([venue])
    if (String(path) === '/api/venues/1') return Response.json(venue)
    if (String(path) === '/api/reservations') return Response.json([reservation])
    if (String(path) === '/api/reservations/12') return Response.json(reservation)
    throw new Error(`Unexpected request: ${String(path)}`)
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('就近查看与创建', () => {
  it('概览和创建弹窗只提供与当前操作有关的说明及入口', async () => {
    const user = userEvent.setup()
    render(<App />)
    const list = await screen.findByRole('region', { name: '场地列表' })
    expect(screen.queryByRole('button', { name: '浏览场地列表' })).not.toBeInTheDocument()
    await user.click(within(list).getByRole('link', { name: '创建场地' }))
    const dialog = await screen.findByRole('dialog', { name: '创建场地' })
    expect(within(dialog).queryByText('开放场地可接受预约；停用场地仍会展示，但无法预约。')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/提交结果会显示在表单下方/)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: '← 返回场地概览' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '关闭创建场地' }))
    expect(window.location.hash).toBe('#/')
  })

  it('详情和预约页的说明对应实际内容，刷新入口描述当前操作', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: '查看羽毛球馆 A详情' }))
    const detail = await screen.findByRole('dialog', { name: '场地详情' })
    expect(within(detail).queryByText('查看场地开放状态与预约信息。')).not.toBeInTheDocument()
    expect(within(detail).queryByRole('link', { name: '← 返回场地概览' })).not.toBeInTheDocument()
    await user.click(within(detail).getByRole('link', { name: '预约此场地' }))
    const refresh = screen.getByRole('button', { name: '刷新场地信息' })
    await user.click(refresh)
    expect(screen.queryByRole('button', { name: '刷新场地列表' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '预约 羽毛球馆 A' })).toBeInTheDocument()
  })

  it('场地卡片先显示详情面板，关闭后返回列表且预约仍是独立入口', async () => {
    const user = userEvent.setup()
    render(<App />)
    const detailsLink = await screen.findByRole('link', { name: '查看羽毛球馆 A详情' })
    expect(screen.getByRole('link', { name: '预约羽毛球馆 A' })).toHaveAttribute('href', '#/venues/1/book')
    await user.click(detailsLink)
    const dialog = await screen.findByRole('dialog', { name: '场地详情' })
    expect(window.location.hash).toBe('#/venues/1')
    expect(within(dialog).getByText('体育中心 1 层')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '场地列表' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '关闭场地详情' }))
    expect(window.location.hash).toBe('#/')
    await waitFor(() => expect(detailsLink).toHaveFocus())
  })

  it('创建场地以弹窗呈现，Esc 关闭后草稿仍可恢复', async () => {
    const user = userEvent.setup()
    render(<App />)
    const list = await screen.findByRole('region', { name: '场地列表' })
    await user.click(within(list).getByRole('link', { name: '创建场地' }))
    const dialog = await screen.findByRole('dialog', { name: '创建场地' })
    const name = within(dialog).getByLabelText('场地名称')
    await user.type(name, '排练室')
    await user.keyboard('{Escape}')
    expect(window.location.hash).toBe('#/')
    await user.click(within(list).getByRole('link', { name: '创建场地' }))
    expect(within(await screen.findByRole('dialog', { name: '创建场地' })).getByLabelText('场地名称')).toHaveValue('排练室')
  })

  it('预约详情面板关闭后保持记录筛选状态', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('link', { name: '预约记录' }))
    await user.click(await screen.findByRole('button', { name: '有效 1' }))
    await user.click(screen.getByRole('link', { name: '查看预约 #12 详情' }))
    const dialog = await screen.findByRole('dialog', { name: '预约详情' })
    expect(within(dialog).getByText('软件技术小组')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '有效 1' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(dialog).getByRole('button', { name: '关闭预约详情' }))
    expect(window.location.hash).toBe('#/reservations')
    expect(screen.getByRole('button', { name: '有效 1' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('从场地详情进入预约时关闭面板并聚焦预约页标题', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('link', { name: '查看羽毛球馆 A详情' }))
    const dialog = await screen.findByRole('dialog', { name: '场地详情' })
    await user.click(within(dialog).getByRole('link', { name: '预约此场地' }))
    expect(screen.queryByRole('dialog', { name: '场地详情' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: '预约 羽毛球馆 A' })).toHaveFocus()
  })
})
