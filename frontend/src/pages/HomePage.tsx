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
          <p className="eyebrow">场地预约 · 便捷查看与管理</p>
          <h1 id="page-title" tabIndex={-1}>找到合适的场地，<br /><span>安排每一次相聚。</span></h1>
          <p className="hero-description">先了解场地的位置、容量与开放时间，再选择适合你的空间。</p>
          <button type="button" className="hero-link" onClick={() => document.getElementById('venues')?.scrollIntoView()}>
            浏览场地 <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="hero-stats" aria-label="场地数据概览">
          <div><strong>{openVenueCount}</strong><span>开放场地</span></div>
          <div><strong>{venueCount}</strong><span>场地总数</span></div>
          <div><strong>{closedVenueCount}</strong><span>暂不可约</span></div>
        </div>
      </section>

      <section id="venues" aria-labelledby="venues-heading" className="panel home-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">场地概览</p>
            <h2 id="venues-heading">场地列表</h2>
            <p>卡片展示位置、开放时间与容量；选择开放场地即可进入预约页。</p>
          </div>
          <button type="button" className="secondary refresh-button" disabled={loadingVenues} onClick={onRefreshVenues}>
            刷新场地列表
          </button>
        </div>
        {loadingVenues ? <p className="empty-state">正在加载场地…</p> : venueError ? <p role="alert" className="notice error">{venueError}</p> : (
          <VenueList venues={venues} />
        )}
      </section>
    </>
  )
}
