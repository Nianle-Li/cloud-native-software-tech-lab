import { useEffect, useState } from 'react'
import { bookingApi } from '../api/booking'
import { bookingHref } from '../navigation'
import type { Venue } from '../types'

interface VenueDetailPageProps {
  venueId: number
}

export function VenueDetailPage({ venueId }: VenueDetailPageProps) {
  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setVenue(null)
    setLoading(true)
    setError('')
    bookingApi.getVenue(venueId)
      .then((item) => { if (active) setVenue(item) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '场地详情加载失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [venueId, reloadKey])

  return (
    <section className="overlay-content">
      <div className="overlay-heading">
        <p className="eyebrow">场地详情</p>
        <h2 data-overlay-heading tabIndex={-1}>{venue?.name ?? '场地详情'}</h2>
      </div>
      <div className="panel detail-panel">
        <div className="section-heading">
          <div><h2>场地信息</h2></div>
          <button type="button" className="secondary refresh-button" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}>刷新场地详情</button>
        </div>
        {loading && <p className="empty-state">正在加载场地详情…</p>}
        {error && <p role="alert" className="notice error">{error}</p>}
        {venue && <>
          <dl className="detail-list">
            <div><dt>场地编号</dt><dd>{venue.id}</dd></div>
            <div><dt>场地名称</dt><dd>{venue.name}</dd></div>
            <div><dt>所在位置</dt><dd>{venue.location}</dd></div>
            <div><dt>可容纳人数</dt><dd>{venue.capacity} 人</dd></div>
            <div><dt>开放时间</dt><dd>{venue.open_time}–{venue.close_time}</dd></div>
            <div><dt>场地状态</dt><dd>{venue.status === 'OPEN' ? '开放中' : '已停用'}</dd></div>
          </dl>
          {venue.status === 'OPEN' && <a className="detail-book-link" href={bookingHref(venue.id)}>预约此场地</a>}
        </>}
      </div>
    </section>
  )
}
