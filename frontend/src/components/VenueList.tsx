import type { Venue } from '../types'

interface VenueListProps {
  venues: Venue[]
  selectedVenueId: number | null
  onSelect: (venueId: number) => void
}

export function VenueList({ venues, selectedVenueId, onSelect }: VenueListProps) {
  if (venues.length === 0) {
    return <p className="empty-state">暂无场地，请等待场地数据初始化。</p>
  }

  return (
    <ul className="venue-list">
      {venues.map((venue) => (
        <li key={venue.id} className={venue.id === selectedVenueId ? 'venue-card selected' : 'venue-card'}>
          <div>
            <h3>{venue.name}</h3>
            <p>{venue.status === 'OPEN' ? '开放中' : '已停用'}</p>
          </div>
          <button type="button" onClick={() => onSelect(venue.id)}>
            查看{venue.name}详情
          </button>
        </li>
      ))}
    </ul>
  )
}
