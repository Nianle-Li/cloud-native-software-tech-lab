import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActionFeedback } from './ActionFeedback'
import type { Reservation, Venue } from '../types'

interface ReservationListProps {
  reservations: Reservation[]
  venues: Venue[]
  cancellingId: number | null
  feedbackReservationId?: number | null
  actionError?: string
  successMessage?: string
  onCancel: (id: number) => void
}

export function ReservationList({ reservations, venues, cancellingId, feedbackReservationId = null, actionError = '', successMessage = '', onCancel }: ReservationListProps) {
  const [filter, setFilter] = useState<'ALL' | Reservation['status']>('ALL')
  const [requestedPage, setRequestedPage] = useState(1)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const confirmationButton = useRef<HTMLButtonElement>(null)
  const cancelButtons = useRef(new Map<number, HTMLButtonElement>())
  const restoreFocusId = useRef<number | null>(null)

  const venueNames = new Map(venues.map((venue) => [venue.id, venue.name]))
  const activeCount = reservations.filter((item) => item.status === 'ACTIVE').length
  const filtered = filter === 'ALL' ? reservations : reservations.filter((item) => item.status === filter)
  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(requestedPage, pageCount)
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const feedbackIsVisible = visible.some((item) => item.id === feedbackReservationId)

  useEffect(() => {
    if (requestedPage > pageCount) setRequestedPage(pageCount)
  }, [requestedPage, pageCount])

  useLayoutEffect(() => {
    if (confirmingId !== null) {
      confirmationButton.current?.focus()
    } else if (restoreFocusId.current !== null) {
      cancelButtons.current.get(restoreFocusId.current)?.focus()
      restoreFocusId.current = null
    }
  }, [confirmingId])

  function selectFilter(next: typeof filter) {
    setFilter(next)
    setRequestedPage(1)
    setConfirmingId(null)
    restoreFocusId.current = null
  }

  if (reservations.length === 0) {
    return <p className="empty-state">暂无预约记录。</p>
  }

  return (
    <div className="reservation-browser">
      <div className="record-toolbar" role="group" aria-label="按预约状态筛选">
        <button type="button" className="filter-button" aria-pressed={filter === 'ALL'} onClick={() => selectFilter('ALL')}>全部 {reservations.length}</button>
        <button type="button" className="filter-button" aria-pressed={filter === 'ACTIVE'} onClick={() => selectFilter('ACTIVE')}>有效 {activeCount}</button>
        <button type="button" className="filter-button" aria-pressed={filter === 'CANCELLED'} onClick={() => selectFilter('CANCELLED')}>已取消 {reservations.length - activeCount}</button>
      </div>
      {!feedbackIsVisible && <ActionFeedback error={actionError} success={successMessage} />}
      {visible.length === 0 ? (
        <p className="empty-state">当前筛选条件下暂无预约记录。</p>
      ) : (
        <ul className="reservation-list">
          {visible.map((reservation) => (
            <li key={reservation.id} className="reservation-card">
              <div className="reservation-heading">
                <h3>预约 #{reservation.id}</h3>
                <span className={reservation.status === 'ACTIVE' ? 'status active' : 'status cancelled'}>
                  {reservation.status === 'ACTIVE' ? '有效' : '已取消'}
                </span>
              </div>
              <dl>
                <div><dt>场地</dt><dd>{venueNames.get(reservation.venue_id) ?? `场地 #${reservation.venue_id}`}</dd></div>
                <div><dt>预约人或组织</dt><dd>{reservation.booked_by}</dd></div>
                <div><dt>预约日期与时间</dt><dd>{reservation.reservation_date} {reservation.start_time}–{reservation.end_time}</dd></div>
                <div><dt>参与人数</dt><dd>{reservation.attendee_count}</dd></div>
                <div><dt>使用目的</dt><dd>{reservation.purpose}</dd></div>
              </dl>
              {reservation.status === 'ACTIVE' && (
                confirmingId === reservation.id ? (
                  <div className="cancel-confirmation" role="group" aria-label={`确认取消预约 ${reservation.id}`}>
                    <p>确定取消预约 #{reservation.id}？取消后仍可在记录中查看。</p>
                    <div className="cancel-confirmation-actions">
                      <button type="button" className="secondary" onClick={() => { restoreFocusId.current = reservation.id; setConfirmingId(null) }} disabled={cancellingId !== null}>保留预约</button>
                      <button type="button" ref={confirmationButton} className="secondary cancel-button" onClick={() => { setConfirmingId(null); onCancel(reservation.id) }} disabled={cancellingId !== null}>确认取消预约 {reservation.id}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" ref={(element) => { if (element) cancelButtons.current.set(reservation.id, element); else cancelButtons.current.delete(reservation.id) }} className="secondary cancel-button" onClick={() => setConfirmingId(reservation.id)} disabled={cancellingId !== null}>
                    {cancellingId === reservation.id ? '取消中…' : `取消预约 ${reservation.id}`}
                  </button>
                )
              )}
              {reservation.id === feedbackReservationId && <ActionFeedback error={actionError} success={successMessage} />}
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <nav className="pagination" aria-label="预约记录分页">
          <button type="button" className="secondary" onClick={() => setRequestedPage(page - 1)} disabled={page === 1}>上一页</button>
          <span>第 {page} / {pageCount} 页</span>
          <button type="button" className="secondary" onClick={() => setRequestedPage(page + 1)} disabled={page === pageCount}>下一页</button>
        </nav>
      )}
    </div>
  )
}
