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
    <section aria-label="场地详情">
      <div className="subpage-banner">
        <a className="back-link" href="#/">← 返回场地概览</a>
        <p className="eyebrow">场地详情</p>
        <h1 tabIndex={-1}>{venue?.name ?? '场地详情'}</h1>
        <p>查看场地开放状态与预约信息。</p>
      </div>
      <div className="panel detail-panel">
        <div className="section-heading">
          <div><p className="section-kicker">场地资料</p><h2>基本信息</h2></div>
          <button type="button" className="secondary refresh-button" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}>刷新场地详情</button>
        </div>
        {loading && <p className="empty-state">正在加载场地详情…</p>}
        {error && <p role="alert" className="notice error">{error}</p>}
        {venue && <>
          <dl className="detail-list">
            <div><dt>场地编号</dt><dd>编号 {venue.id}</dd></div>
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
