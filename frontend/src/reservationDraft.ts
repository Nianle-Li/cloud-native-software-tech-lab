export interface ReservationDraft {
  bookedBy: string
  reservationDate: string
  startTime: string
  endTime: string
  attendeeCount: string
  purpose: string
}

export function emptyReservationDraft(): ReservationDraft {
  return { bookedBy: '', reservationDate: '', startTime: '', endTime: '', attendeeCount: '1', purpose: '' }
}
