export type VenueStatus = 'OPEN' | 'CLOSED'
export type ReservationStatus = 'ACTIVE' | 'CANCELLED'

export interface Venue {
  id: number
  name: string
  location: string
  capacity: number
  open_time: string
  close_time: string
  status: VenueStatus
}

export interface CreateReservationInput {
  venue_id: number
  booked_by: string
  reservation_date: string
  start_time: string
  end_time: string
  attendee_count: number
  purpose: string
}

export interface Reservation extends CreateReservationInput {
  id: number
  status: ReservationStatus
  created_at: string
  cancelled_at: string | null
}
