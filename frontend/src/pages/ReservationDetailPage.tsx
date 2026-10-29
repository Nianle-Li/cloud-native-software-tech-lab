import { useEffect, useState } from 'react'
import { bookingApi } from '../api/booking'
import { venueDetailHref } from '../navigation'
import type { Reservation, Venue } from '../types'

interface ReservationDetailPageProps {
  reservationId: number
  venues: Venue[]
}

export function ReservationDetailPage({ reservationId, venues }: ReservationDetailPageProps) {
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setReservation(null)
    setLoading(true)
    setError('')
    bookingApi.getReservation(reservationId)
      .then((item) => { if (active) setReservation(item) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '预约详情加载失败') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reservationId, reloadKey])

  const venueName = venues.find((item) => item.id === reservation?.venue_id)?.name ?? '未知场地'

  return (
    <section aria-label="预约详情">
      <div className="subpage-banner">
        <a className="back-link" href="#/reservations">← 返回预约记录</a>
        <p className="eyebrow">预约详情</p>
        <h1 tabIndex={-1}>{reservation ? `预约 #${reservation.id}` : '预约详情'}</h1>
        <p>查看预约状态和完整记录。</p>
      </div>
      <div className="panel detail-panel">
        <div className="section-heading">
          <div><p className="section-kicker">预约资料</p><h2>记录信息</h2></div>
          <button type="button" className="secondary refresh-button" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}>刷新预约详情</button>
        </div>
        {loading && <p className="empty-state">正在加载预约详情…</p>}
        {error && <p role="alert" className="notice error">{error}</p>}
        {reservation && <>
          <dl className="detail-list">
            <div><dt>预约编号</dt><dd>编号 {reservation.id}</dd></div>
            <div><dt>预约状态</dt><dd>{reservation.status === 'ACTIVE' ? '有效' : '已取消'}</dd></div>
            <div><dt>场地</dt><dd><a href={venueDetailHref(reservation.venue_id)}>{venueName}（编号 {reservation.venue_id}）</a></dd></div>
            <div><dt>预约人或组织</dt><dd>{reservation.booked_by}</dd></div>
            <div><dt>预约日期</dt><dd>{reservation.reservation_date}</dd></div>
            <div><dt>预约时间</dt><dd>{reservation.start_time}–{reservation.end_time}</dd></div>
            <div><dt>参与人数</dt><dd>{reservation.attendee_count} 人</dd></div>
            <div><dt>使用目的</dt><dd>{reservation.purpose}</dd></div>
            <div><dt>创建时间</dt><dd>{reservation.created_at}</dd></div>
            {reservation.cancelled_at && <div><dt>取消时间</dt><dd>{reservation.cancelled_at}</dd></div>}
          </dl>
        </>}
      </div>
    </section>
  )
}
