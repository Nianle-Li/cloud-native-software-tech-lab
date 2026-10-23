import type { Reservation, Venue } from '../types'

interface ReservationListProps {
  reservations: Reservation[]
  venues: Venue[]
  cancellingId: number | null
  onCancel: (id: number) => void
}

export function ReservationList({ reservations, venues, cancellingId, onCancel }: ReservationListProps) {
  if (reservations.length === 0) {
    return <p className="empty-state">暂无预约记录。</p>
  }

  const venueNames = new Map(venues.map((venue) => [venue.id, venue.name]))

  return (
    <ul className="reservation-list">
      {reservations.map((reservation) => (
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
            <div><dt>日期与时间</dt><dd>{reservation.reservation_date} {reservation.start_time}–{reservation.end_time}</dd></div>
            <div><dt>参与人数</dt><dd>{reservation.attendee_count}</dd></div>
            <div><dt>使用目的</dt><dd>{reservation.purpose}</dd></div>
          </dl>
          {reservation.status === 'ACTIVE' && (
            <button type="button" className="secondary" onClick={() => onCancel(reservation.id)} disabled={cancellingId !== null}>
              {cancellingId === reservation.id ? '取消中…' : `取消预约 ${reservation.id}`}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
