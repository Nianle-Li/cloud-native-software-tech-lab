import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CreateReservationInput, Venue } from '../types'

interface ReservationFormProps {
  venue: Venue
  isSubmitting: boolean
  isUnavailable: boolean
  onCreate: (input: CreateReservationInput) => Promise<boolean>
}

export function ReservationForm({ venue, isSubmitting, isUnavailable, onCreate }: ReservationFormProps) {
  const [bookedBy, setBookedBy] = useState('')
  const [reservationDate, setReservationDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [attendeeCount, setAttendeeCount] = useState('1')
  const [purpose, setPurpose] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting || isUnavailable) return
    const created = await onCreate({
      venue_id: venue.id,
      booked_by: bookedBy.trim(),
      reservation_date: reservationDate,
      start_time: startTime,
      end_time: endTime,
      attendee_count: Number(attendeeCount),
      purpose: purpose.trim(),
    })
    if (created) {
      setBookedBy('')
      setReservationDate('')
      setStartTime('')
      setEndTime('')
      setAttendeeCount('1')
      setPurpose('')
    }
  }

  return (
    <form aria-label="创建预约" onSubmit={handleSubmit} className="booking-form">
      <h3>创建预约</h3>
      <p className="form-context">当前场地：{venue.name}</p>
      <div className="form-grid">
        <label>
          预约人或组织
          <input value={bookedBy} onChange={(event) => setBookedBy(event.target.value)} maxLength={100} required />
        </label>
        <label>
          预约日期
          <input type="date" value={reservationDate} onChange={(event) => setReservationDate(event.target.value)} required />
        </label>
        <label>
          开始时间
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
        <label>
          结束时间
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </label>
        <label>
          参与人数
          <input type="number" min="1" max={venue.capacity} value={attendeeCount} onChange={(event) => setAttendeeCount(event.target.value)} required />
        </label>
        <label className="full-width">
          使用目的
          <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} rows={3} required />
        </label>
      </div>
      <button type="submit" disabled={isSubmitting || isUnavailable}>
        {isSubmitting ? '提交中…' : '提交预约'}
      </button>
    </form>
  )
}
