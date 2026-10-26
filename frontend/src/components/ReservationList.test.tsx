import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Reservation, Venue } from '../types'
import { ReservationList } from './ReservationList'

const venue: Venue = {
  id: 1,
  name: '羽毛球馆 A',
  location: '体育中心 1 层',
  capacity: 8,
  open_time: '08:00',
  close_time: '22:00',
  status: 'OPEN',
}

const reservations: Reservation[] = Array.from({ length: 8 }, (_, index) => ({
  id: 8 - index,
  venue_id: 1,
  booked_by: `预约人 ${8 - index}`,
  reservation_date: '2030-10-30',
  start_time: '10:00',
  end_time: '11:00',
  attendee_count: 2,
  purpose: '小组活动',
  status: index === 1 || index === 5 ? 'CANCELLED' : 'ACTIVE',
  created_at: '2030-10-01T10:00:00+08:00',
  cancelled_at: index === 1 || index === 5 ? '2030-10-01T11:00:00+08:00' : null,
}))

afterEach(cleanup)

describe('预约记录浏览', () => {
  it('超过一页时按原顺序分页，翻页不发起额外请求', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(<ReservationList reservations={reservations} venues={[venue]} cancellingId={null} onCancel={onCancel} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('预约人 8')).toBeInTheDocument()
    expect(screen.queryByText('预约人 1')).not.toBeInTheDocument()
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('预约人 1')).toBeInTheDocument()
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('状态筛选显示真实记录数，切换时回到第一页', async () => {
    const user = userEvent.setup()
    render(<ReservationList reservations={reservations} venues={[venue]} cancellingId={null} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await user.click(screen.getByRole('button', { name: '已取消 2' }))
    expect(screen.getByRole('button', { name: '已取消 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('预约人 7')).toBeInTheDocument()
    expect(screen.getByText('预约人 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '有效 6' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.queryByText('预约人 7')).not.toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(6)
  })

  it('记录减少后不会停留在不存在的页', async () => {
    const user = userEvent.setup()
    const props = { venues: [venue], cancellingId: null, onCancel: vi.fn() }
    const { rerender } = render(<ReservationList reservations={reservations} {...props} />)
    await user.click(screen.getByRole('button', { name: '下一页' }))

    rerender(<ReservationList reservations={reservations.slice(0, 3)} {...props} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('预约人 8')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '下一页' })).not.toBeInTheDocument()
  })
})
