import { ApiError, requestJson } from './client'
import type { CreateReservationInput, CreateVenueInput, Reservation, Venue } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

function isVenue(value: unknown): value is Venue {
  return isRecord(value)
    && isPositiveInteger(value.id)
    && isNonBlank(value.name)
    && isNonBlank(value.location)
    && isPositiveInteger(value.capacity)
    && isTime(value.open_time)
    && isTime(value.close_time)
    && value.open_time < value.close_time
    && (value.status === 'OPEN' || value.status === 'CLOSED')
}

function isReservation(value: unknown): value is Reservation {
  return isRecord(value)
    && isPositiveInteger(value.id)
    && isPositiveInteger(value.venue_id)
    && isNonBlank(value.booked_by)
    && typeof value.reservation_date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value.reservation_date)
    && isTime(value.start_time)
    && isTime(value.end_time)
    && value.start_time < value.end_time
    && isPositiveInteger(value.attendee_count)
    && isNonBlank(value.purpose)
    && (value.status === 'ACTIVE' || value.status === 'CANCELLED')
    && isNonBlank(value.created_at)
    && ((value.status === 'ACTIVE' && value.cancelled_at === null)
      || (value.status === 'CANCELLED' && isNonBlank(value.cancelled_at)))
}

function requireShape<T>(value: unknown, valid: (item: unknown) => item is T): T {
  if (!valid(value)) {
    throw new ApiError('服务器返回了无效数据，请稍后重试', 200, 'INVALID_RESPONSE')
  }
  return value
}

function requireList<T>(value: unknown, valid: (item: unknown) => item is T): T[] {
  if (!Array.isArray(value) || !value.every(valid)) {
    throw new ApiError('服务器返回了无效数据，请稍后重试', 200, 'INVALID_RESPONSE')
  }
  return value
}

export const bookingApi = {
  async listVenues(): Promise<Venue[]> {
    return requireList(await requestJson<unknown>('/venues', undefined, 200), isVenue)
  },

  async getVenue(id: number): Promise<Venue> {
    const body = await requestJson<unknown>(`/venues/${id}`, undefined, 200)
    return requireShape(body, (value): value is Venue => isVenue(value) && value.id === id)
  },

  async createVenue(input: CreateVenueInput): Promise<Venue> {
    const body = await requestJson<unknown>('/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, 201)
    return requireShape(body, (value): value is Venue => isVenue(value)
      && value.name === input.name
      && value.location === input.location
      && value.capacity === input.capacity
      && value.open_time === input.open_time
      && value.close_time === input.close_time
      && value.status === (input.status ?? 'OPEN'))
  },

  async listReservations(): Promise<Reservation[]> {
    return requireList(await requestJson<unknown>('/reservations', undefined, 200), isReservation)
  },

  async getReservation(id: number): Promise<Reservation> {
    const body = await requestJson<unknown>(`/reservations/${id}`, undefined, 200)
    return requireShape(body, (value): value is Reservation => isReservation(value) && value.id === id)
  },

  async createReservation(input: CreateReservationInput): Promise<Reservation> {
    const body = await requestJson<unknown>('/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, 201)
    return requireShape(body, (value): value is Reservation => isReservation(value)
      && value.venue_id === input.venue_id
      && value.booked_by === input.booked_by
      && value.reservation_date === input.reservation_date
      && value.start_time === input.start_time
      && value.end_time === input.end_time
      && value.attendee_count === input.attendee_count
      && value.purpose === input.purpose
      && value.status === 'ACTIVE')
  },

  async cancelReservation(id: number): Promise<Reservation> {
    const body = await requestJson<unknown>(`/reservations/${id}/cancel`, { method: 'POST' }, 200)
    return requireShape(body, (value): value is Reservation => isReservation(value)
      && value.id === id
      && value.status === 'CANCELLED')
  },
}
