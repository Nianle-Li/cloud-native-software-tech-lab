import { ActionFeedback } from '../components/ActionFeedback'
import { ReservationList } from '../components/ReservationList'
import type { Reservation, Venue } from '../types'

interface ReservationsPageProps {
  reservations: Reservation[]
  venues: Venue[]
  loadingReservations: boolean
  reservationError: string
  cancellingId: number | null
  feedbackReservationId: number | null
  actionError: string
  successMessage: string
  onRefreshReservations: () => void
  onCancel: (id: number) => void
}

export function ReservationsPage({ reservations, venues, loadingReservations, reservationError, cancellingId, feedbackReservationId, actionError, successMessage, onRefreshReservations, onCancel }: ReservationsPageProps) {
  return (
    <>
      <div className="subpage-banner">
        <a className="back-link" href="#/">← 返回场地概览</a>
        <p className="eyebrow">预约管理</p>
        <h1 tabIndex={-1}>预约记录</h1>
        <p>查看状态，管理有效预约。</p>
      </div>
      <section className="panel records-panel" aria-labelledby="records-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">查看与管理</p>
            <h2 id="records-heading">预约列表</h2>
            <p>按状态筛选；已取消记录仍保留。</p>
          </div>
          <button type="button" className="secondary refresh-button" disabled={loadingReservations} onClick={onRefreshReservations}>
            刷新预约记录
          </button>
        </div>
        {reservations.length === 0 && (loadingReservations || reservationError) && <ActionFeedback error={actionError} success={successMessage} />}
        {loadingReservations && <p className="empty-state">正在加载预约记录…</p>}
        {reservationError && <p role="alert" className="notice error">{reservationError}{reservations.length > 0 && '；当前显示上次加载的记录，可能不是最新。'}</p>}
        {(reservations.length > 0 || (!loadingReservations && !reservationError)) && (
          <ReservationList reservations={reservations} venues={venues} cancellingId={cancellingId} feedbackReservationId={feedbackReservationId} actionError={actionError} successMessage={successMessage} onCancel={onCancel} />
        )}
      </section>
    </>
  )
}
