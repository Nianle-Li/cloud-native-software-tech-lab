import type { FormEvent } from 'react'
import { emptyReservationDraft } from '../reservationDraft'
import type { ReservationDraft } from '../reservationDraft'
import type { CreateReservationInput, Venue } from '../types'

interface ReservationFormProps {
  venue: Venue
  draft: ReservationDraft
  onDraftChange: (draft: ReservationDraft) => void
  isSubmitting: boolean
  isUnavailable: boolean
  onCreate: (input: CreateReservationInput) => Promise<boolean>
}

export function ReservationForm({ venue, draft, onDraftChange, isSubmitting, isUnavailable, onCreate }: ReservationFormProps) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || isUnavailable) return
    const created = await onCreate({
      venue_id: venue.id,
      booked_by: draft.bookedBy.trim(),
      reservation_date: draft.reservationDate,
      start_time: draft.startTime,
      end_time: draft.endTime,
      attendee_count: Number(draft.attendeeCount),
      purpose: draft.purpose.trim(),
    })
    if (created) onDraftChange(emptyReservationDraft())
  }

  return (
    <form aria-label="创建预约" onSubmit={handleSubmit} noValidate className="booking-form">
      <h3>创建预约</h3>
      <p className="form-intro">所有字段均为必填，提交结果会显示在表单下方。</p>
      <fieldset className="form-fields" aria-label="预约资料" disabled={isSubmitting}>
        <div className="form-grid">
          <label>
            预约人或组织
            <input value={draft.bookedBy} onChange={(event) => onDraftChange({ ...draft, bookedBy: event.target.value })} maxLength={100} placeholder="例如：软件技术小组" required />
          </label>
          <label>
            预约日期
            <input type="date" value={draft.reservationDate} onChange={(event) => onDraftChange({ ...draft, reservationDate: event.target.value })} required />
          </label>
          <label>
            开始时间
            <input type="time" value={draft.startTime} onChange={(event) => onDraftChange({ ...draft, startTime: event.target.value })} required />
          </label>
          <label>
            结束时间
            <input type="time" value={draft.endTime} onChange={(event) => onDraftChange({ ...draft, endTime: event.target.value })} required />
          </label>
          <label>
            参与人数
            <input type="number" min="1" max={venue.capacity} value={draft.attendeeCount} onChange={(event) => onDraftChange({ ...draft, attendeeCount: event.target.value })} required />
          </label>
          <label className="full-width">
            使用目的
            <textarea value={draft.purpose} onChange={(event) => onDraftChange({ ...draft, purpose: event.target.value })} maxLength={500} rows={3} placeholder="简要说明场地用途" required />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={isUnavailable}>
            {isSubmitting ? '提交中…' : '提交预约'}
          </button>
          <p>提交后由服务器确认场地与时段是否可用。</p>
        </div>
      </fieldset>
    </form>
  )
}
