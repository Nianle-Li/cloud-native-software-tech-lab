import type { Reservation } from './types'

export interface BookedSlot {
  startTime: string
  endTime: string
}

export function bookedSlotsForDate(reservations: Reservation[], venueId: number, date: string): BookedSlot[] {
  return reservations
    .filter((reservation) => reservation.venue_id === venueId
      && reservation.reservation_date === date
      && reservation.status === 'ACTIVE')
    .map(({ start_time, end_time }) => ({ startTime: start_time, endTime: end_time }))
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
}

export function overlapsBookedSlot(slots: BookedSlot[], startTime: string, endTime: string): boolean {
  if (!startTime || !endTime || startTime >= endTime) return false
  return slots.some((slot) => slot.startTime < endTime && slot.endTime > startTime)
}

export function isFullyBooked(slots: BookedSlot[], openTime: string, closeTime: string): boolean {
  let coveredUntil = openTime
  for (const slot of slots) {
    if (slot.startTime > coveredUntil) return false
    if (slot.endTime > coveredUntil) coveredUntil = slot.endTime
    if (coveredUntil >= closeTime) return true
  }
  return false
}
