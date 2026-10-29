import { useEffect, useState } from 'react'

export type Route =
  | { kind: 'home' }
  | { kind: 'createVenue' }
  | { kind: 'booking'; venueId: number }
  | { kind: 'venueDetail'; venueId: number }
  | { kind: 'reservationDetail'; reservationId: number }
  | { kind: 'reservations' }
  | { kind: 'notFound' }

export function parseRoute(hash: string): Route {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  if (path === '' || path === '/') return { kind: 'home' }
  if (path === '/reservations') return { kind: 'reservations' }
  if (path === '/venues/new') return { kind: 'createVenue' }

  const booking = /^\/venues\/([1-9]\d*)\/book$/.exec(path)
  if (booking) {
    const venueId = Number(booking[1])
    if (Number.isSafeInteger(venueId)) return { kind: 'booking', venueId }
  }
  const venueDetail = /^\/venues\/([1-9]\d*)$/.exec(path)
  if (venueDetail) {
    const venueId = Number(venueDetail[1])
    if (Number.isSafeInteger(venueId)) return { kind: 'venueDetail', venueId }
  }
  const reservationDetail = /^\/reservations\/([1-9]\d*)$/.exec(path)
  if (reservationDetail) {
    const reservationId = Number(reservationDetail[1])
    if (Number.isSafeInteger(reservationId)) return { kind: 'reservationDetail', reservationId }
  }
  return { kind: 'notFound' }
}

export function bookingHref(venueId: number): string {
  return `#/venues/${venueId}/book`
}

export function venueDetailHref(venueId: number): string {
  return `#/venues/${venueId}`
}

export function reservationDetailHref(reservationId: number): string {
  return `#/reservations/${reservationId}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  return route
}
