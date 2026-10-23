import { ApiError, requestJson } from './client'
import type { CreateReservationInput, Reservation, Venue } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isVenue(value: unknown): value is Venue {
  return isRecord(value)
    && Number.isInteger(value.id)
    && typeof value.name === 'string'
    && typeof value.location === 'string'
    && Number.isInteger(value.capacity)
    && typeof value.open_time === 'string'
    && typeof value.close_time === 'string'
    && (value.status === 'OPEN' || value.status === 'CLOSED')
}

function isReservation(value: unknown): value is Reservation {
  return isRecord(value)
    && Number.isInteger(value.id)
    && Number.isInteger(value.venue_id)
    && typeof value.booked_by === 'string'
    && typeof value.reservation_date === 'string'
    && typeof value.start_time === 'string'
    && typeof value.end_time === 'string'
    && Number.isInteger(value.attendee_count)
    && typeof value.purpose === 'string'
    && (value.status === 'ACTIVE' || value.status === 'CANCELLED')
    && typeof value.created_at === 'string'
    && (value.cancelled_at === null || typeof value.cancelled_at === 'string')
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
    return requireList(await requestJson<unknown>('/venues'), isVenue)
  },

  async listReservations(): Promise<Reservation[]> {
    return requireList(await requestJson<unknown>('/reservations'), isReservation)
  },

  async createReservation(input: CreateReservationInput): Promise<Reservation> {
    const body = await requestJson<unknown>('/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return requireShape(body, isReservation)
  },

  async cancelReservation(id: number): Promise<Reservation> {
    const body = await requestJson<unknown>(`/reservations/${id}/cancel`, { method: 'POST' })
    return requireShape(body, isReservation)
  },
}
