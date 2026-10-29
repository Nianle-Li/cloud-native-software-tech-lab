import type { Venue } from '../types'
import { bookingHref, venueDetailHref } from '../navigation'

interface VenueListProps {
  venues: Venue[]
}

export function VenueList({ venues }: VenueListProps) {
  if (venues.length === 0) {
    return <p className="empty-state">暂无场地，创建后将在这里显示。</p>
  }

  return (
    <ul className="venue-list">
      {venues.map((venue) => {
        const content = <>
          <div className="venue-card-top">
            <span className="venue-number" aria-hidden="true">{String(venue.id).padStart(2, '0')}</span>
            <span className={venue.status === 'OPEN' ? 'status active' : 'status cancelled'}>{venue.status === 'OPEN' ? '开放中' : '已停用'}</span>
          </div>
          <div className="venue-card-body">
            <h3>{venue.name}</h3>
            <p>{venue.location}</p>
          </div>
          <div className="venue-card-meta">
            <span>{venue.open_time}–{venue.close_time}</span>
            <span>最多 {venue.capacity} 人</span>
          </div>
          <span className="venue-detail-prompt" aria-hidden="true">查看场地详情 →</span>
        </>
        return <li key={venue.id} className={`venue-card${venue.status === 'CLOSED' ? ' closed' : ''}`}>
          <a className="venue-card-content" href={venueDetailHref(venue.id)} aria-label={`查看${venue.name}详情`}>{content}</a>
          {venue.status === 'OPEN' && <div className="venue-card-footer">
            <a className="venue-action" href={bookingHref(venue.id)} aria-label={`预约${venue.name}`}>预约此场地 ↗</a>
          </div>}
        </li>
      })}
    </ul>
  )
}
