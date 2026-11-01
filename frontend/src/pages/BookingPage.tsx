import { useEffect, useState } from 'react'
import { bookedSlotsForDate, isFullyBooked, overlapsBookedSlot } from '../availability'
import type { BookedSlot } from '../availability'
import { bookingApi } from '../api/booking'
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
  const [snapshot, setSnapshot] = useState<{ venueId: number; date: string; slots: BookedSlot[] } | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotError, setSlotError] = useState(false)
  const [slotReloadKey, setSlotReloadKey] = useState(0)
  const date = draft.reservationDate

  useEffect(() => {
    if (!venue || venue.status !== 'OPEN' || !date) {
      setSnapshot(null)
      setLoadingSlots(false)
      setSlotError(false)
      return
    }

    let active = true
    const venueId = venue.id
    setSnapshot(null)
    setLoadingSlots(true)
    setSlotError(false)
    bookingApi.listReservations()
      .then((reservations) => {
        if (active) setSnapshot({ venueId, date, slots: bookedSlotsForDate(reservations, venueId, date) })
      })
      .catch(() => {
        if (active) setSlotError(true)
      })
      .finally(() => {
        if (active) setLoadingSlots(false)
      })
    return () => { active = false }
  }, [venue?.id, venue?.status, date, slotReloadKey])

  const slots = snapshot?.venueId === venue?.id && snapshot?.date === date ? snapshot.slots : null
  const fullyBooked = Boolean(venue && slots && isFullyBooked(slots, venue.open_time, venue.close_time))
  const selectedSlotBooked = slots ? overlapsBookedSlot(slots, draft.startTime, draft.endTime) : false

  async function handleCreate(input: CreateReservationInput): Promise<boolean> {
    const created = await onCreate(input)
    if (!created) setSlotReloadKey((current) => current + 1)
    return created
  }

  return (
    <div className="booking-page">
      <div className="subpage-banner">
        <a className="back-link" href="#/">← 返回场地概览</a>
        <p className="eyebrow">场地预约</p>
        <h1 tabIndex={-1}>{venue ? `预约 ${venue.name}` : '预约场地'}</h1>
        <p>核对场地信息后填写预约资料。</p>
      </div>
      <div className="booking-layout">
        <aside className="panel booking-aside" aria-labelledby="venue-summary-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">当前选择</p>
              <h2 id="venue-summary-heading">场地信息</h2>
            </div>
            <button type="button" className="secondary refresh-button" disabled={loadingVenues} onClick={onRefreshVenues}>
              刷新场地信息
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
          <p className="booking-aside-note">预约日期和时间按北京时间计算。可容纳人数是单笔预约的人数上限；同一时段只接受一笔预约。</p>
          {venue?.status === 'OPEN' && (
            <section className="booking-availability" aria-labelledby="booking-availability-heading">
              <div className="booking-availability-heading">
                <h3 id="booking-availability-heading">已预约时段</h3>
                {date && (
                  <button type="button" className="secondary" disabled={loadingSlots} onClick={() => setSlotReloadKey((current) => current + 1)}>
                    刷新时段
                  </button>
                )}
              </div>
              {!date ? (
                <p>选择预约日期后查看该场地的占用时段。</p>
              ) : loadingSlots ? (
                <p role="status">正在查询已预约时段…</p>
              ) : slotError ? (
                <p>暂时无法查询已预约时段，请刷新重试；仍可提交预约，由后端确认。</p>
              ) : slots ? (
                <>
                  {fullyBooked ? <p className="booking-availability-full">该日期开放时段已约满。</p>
                    : slots.length === 0 ? <p>该日期暂无已预约时段。</p> : null}
                  {slots.length > 0 && (
                    <ul className="booked-slots">
                      {slots.map((slot, index) => (
                        <li key={`${slot.startTime}-${slot.endTime}-${index}`}>
                          <span>{slot.startTime}–{slot.endTime}</span><span>已预约</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {selectedSlotBooked && <p className="booking-availability-conflict" role="status">所选时段与已预约时段重叠，请调整时间。</p>}
                  <p className="booking-availability-note">占用情况可能变化，最终以提交结果为准。</p>
                </>
              ) : null}
            </section>
          )}
        </aside>

        <section className="panel booking-panel" aria-labelledby="booking-heading">
          <div className="section-heading">
            <div>
              <h2 id="booking-heading">填写预约信息</h2>
            </div>
          </div>
          {venue?.status === 'OPEN' ? (
            <>
              {loadingVenues && <p className="empty-state form-notice">正在更新场地信息…</p>}
              {venueError && <p className="empty-state form-notice">场地信息暂不可用，请刷新场地信息。</p>}
              <ReservationForm
                venue={venue}
                draft={draft}
                onDraftChange={onDraftChange}
                isSubmitting={isSubmitting}
                isUnavailable={loadingVenues || Boolean(venueError)}
                onCreate={handleCreate}
              />
            </>
          ) : loadingVenues ? (
            <p className="empty-state">正在加载场地信息…</p>
          ) : venueError ? (
            <p className="empty-state">场地信息暂不可用，请刷新场地信息。</p>
          ) : venue ? (
            <p className="empty-state">该场地已停用，无法预约。</p>
          ) : (
            <p className="empty-state">场地不存在或已从列表移除。</p>
          )}
          <ActionFeedback error={actionError} success={successMessage} />
          {venue?.status === 'OPEN' && <a className="booking-records-link" href="#/reservations">查看预约记录 →</a>}
        </section>
      </div>
    </div>
  )
}
