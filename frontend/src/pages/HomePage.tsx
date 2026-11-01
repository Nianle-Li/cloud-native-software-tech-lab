import { VenueList } from '../components/VenueList'
import type { Venue } from '../types'

interface HomePageProps {
  venues: Venue[]
  loadingVenues: boolean
  venueError: string
  onRefreshVenues: () => void
}

export function HomePage({ venues, loadingVenues, venueError, onRefreshVenues }: HomePageProps) {
  const venueCount = loadingVenues || venueError ? '—' : String(venues.length)
  const openVenueCount = loadingVenues || venueError ? '—' : String(venues.filter((venue) => venue.status === 'OPEN').length)
  const closedVenueCount = loadingVenues || venueError ? '—' : String(venues.filter((venue) => venue.status === 'CLOSED').length)

  return (
    <>
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow">查看场地 · 在线预约</p>
          <h1 id="page-title" tabIndex={-1}>找到合适场地，<span>轻松安排活动。</span></h1>
          <p className="hero-description">了解场地位置、开放时间和容量，选定场地后即可预约。</p>
        </div>
        <div className="hero-stats" aria-label="场地数据概览">
          <p className="hero-stats-title">场地概况</p>
          <div><strong>{openVenueCount}</strong><span>开放</span></div>
          <div><strong>{venueCount}</strong><span>全部</span></div>
          <div><strong>{closedVenueCount}</strong><span>停用</span></div>
        </div>
      </section>

      <section id="venues" aria-labelledby="venues-heading" className="panel home-panel">
        <div className="section-heading">
          <div>
            <h2 id="venues-heading">场地列表</h2>
          </div>
          <div className="section-actions">
            <a className="create-venue-link" href="#/venues/new">创建场地</a>
            <button type="button" className="secondary refresh-button" disabled={loadingVenues} onClick={onRefreshVenues}>
              刷新场地列表
            </button>
          </div>
        </div>
        {loadingVenues ? <p className="empty-state">正在加载场地…</p> : venueError ? <p role="alert" className="notice error">{venueError}</p> : (
          <VenueList venues={venues} />
        )}
      </section>
    </>
  )
}
