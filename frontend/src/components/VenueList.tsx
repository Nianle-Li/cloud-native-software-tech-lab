import type { Venue } from '../types'
import { bookingHref } from '../navigation'

interface VenueListProps {
  venues: Venue[]
}

export function VenueList({ venues }: VenueListProps) {
  if (venues.length === 0) {
    return <p className="empty-state">暂无场地信息，请稍后刷新列表。</p>
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
          <span className="venue-action" aria-hidden="true">{venue.status === 'OPEN' ? '预约此场地 ↗' : '场地已停用'}</span>
        </>
        return <li key={venue.id} className={`venue-card${venue.status === 'CLOSED' ? ' closed' : ''}`}>
          {venue.status === 'OPEN'
            ? <a className="venue-card-content" href={bookingHref(venue.id)} aria-label={`预约${venue.name}`}>{content}</a>
            : <div className="venue-card-content">{content}</div>}
        </li>
      })}
    </ul>
  )
}
