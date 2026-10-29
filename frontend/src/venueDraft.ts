import type { VenueStatus } from './types'

export interface VenueDraft {
  name: string
  location: string
  capacity: string
  openTime: string
  closeTime: string
  status: VenueStatus
}

export function emptyVenueDraft(): VenueDraft {
  return { name: '', location: '', capacity: '', openTime: '', closeTime: '', status: 'OPEN' }
}
