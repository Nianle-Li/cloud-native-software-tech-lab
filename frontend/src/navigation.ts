import { useEffect, useState } from 'react'

export type Route =
  | { kind: 'home' }
  | { kind: 'booking'; venueId: number }
  | { kind: 'reservations' }
  | { kind: 'notFound' }

export function parseRoute(hash: string): Route {
  const path = hash.startsWith('#') ? hash.slice(1) : hash
  if (path === '' || path === '/') return { kind: 'home' }
  if (path === '/reservations') return { kind: 'reservations' }

  const booking = /^\/venues\/([1-9]\d*)\/book$/.exec(path)
  if (booking) {
    const venueId = Number(booking[1])
    if (Number.isSafeInteger(venueId)) return { kind: 'booking', venueId }
  }
  return { kind: 'notFound' }
}

export function bookingHref(venueId: number): string {
  return `#/venues/${venueId}/book`
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
