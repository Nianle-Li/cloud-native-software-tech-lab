import { ActionFeedback } from '../components/ActionFeedback'
import { ReservationForm } from '../components/ReservationForm'
import type { ReservationDraft } from '../reservationDraft'
import type { CreateReservationInput, Venue } from '../types'

interface BookingPageProps {
  venue: Venue | null
  draft: ReservationDraft
  onDraftChange: (draft: ReservationDraft) => void
  loadingVenues: boolean
  venueError: string
  isSubmitting: boolean
  actionError: string
  successMessage: string
  onRefreshVenues: () => void
  onCreate: (input: CreateReservationInput) => Promise<boolean>
}

export function BookingPage({ venue, draft, onDraftChange, loadingVenues, venueError, isSubmitting, actionError, successMessage, onRefreshVenues, onCreate }: BookingPageProps) {
  return (
    <>
      <div className="subpage-banner">
        <a className="back-link" href="#/">← 返回场地概览</a>
        <p className="eyebrow">场地预约</p>
        <h1>{venue ? `预约 ${venue.name}` : '预约场地'}</h1>
        <p>核对场地信息并填写预约申请。提交结果以服务器响应为准。</p>
      </div>
      <div className="booking-layout">
        <aside className="panel booking-aside" aria-labelledby="venue-summary-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">当前选择</p>
              <h2 id="venue-summary-heading">场地信息</h2>
            </div>
            <button type="button" className="secondary refresh-button" disabled={loadingVenues} onClick={onRefreshVenues}>
              刷新场地列表
            </button>
          </div>
          {venue ? (
            <div className="booking-venue-card">
              <span className={venue.status === 'OPEN' ? 'status active' : 'status cancelled'}>{venue.status === 'OPEN' ? '开放中' : '已停用'}</span>
              <h3>{venue.name}</h3>
              <dl>
                <div><dt>位置</dt><dd>{venue.location}</dd></div>
                <div><dt>开放时间</dt><dd>{venue.open_time}–{venue.close_time}</dd></div>
                <div><dt>可容纳人数</dt><dd>{venue.capacity} 人</dd></div>
              </dl>
            </div>
          ) : loadingVenues ? <p className="empty-state">正在加载场地信息…</p> : null}
          {venueError && <p role="alert" className="notice error aside-error">{venueError}</p>}
          <p className="booking-aside-note">预约日期和时段按北京时间计算；若时段冲突，服务器会拒绝本次申请。</p>
        </aside>

        <section className="panel booking-panel" aria-labelledby="booking-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">填写预约申请</p>
              <h2 id="booking-heading">预约场地</h2>
              <p>请填写预约人、日期、时段、人数与使用目的。</p>
            </div>
          </div>
          {venue && <p className="booking-inline-summary">{venue.name} · {venue.open_time}–{venue.close_time} · 最多 {venue.capacity} 人</p>}
          {venue?.status === 'OPEN' ? (
            <>
              {loadingVenues && <p className="empty-state form-notice">正在更新场地信息…</p>}
              {venueError && <p className="empty-state form-notice">场地信息暂不可用，请刷新场地列表。</p>}
              <ReservationForm
                venue={venue}
                draft={draft}
                onDraftChange={onDraftChange}
                isSubmitting={isSubmitting}
                isUnavailable={loadingVenues || Boolean(venueError)}
                onCreate={onCreate}
              />
            </>
          ) : loadingVenues ? (
            <p className="empty-state">正在加载场地信息…</p>
          ) : venueError ? (
            <p className="empty-state">场地信息暂不可用，请刷新场地列表。</p>
          ) : venue ? (
            <p className="empty-state">该场地已停用，无法预约。</p>
          ) : (
            <p className="empty-state">场地不存在或已从列表移除。</p>
          )}
          <ActionFeedback error={actionError} success={successMessage} />
          {venue?.status === 'OPEN' && <a className="booking-records-link" href="#/reservations">查看预约记录 →</a>}
        </section>
      </div>
    </>
  )
}
