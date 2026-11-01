import { shanghaiDateTime } from './shanghaiTime'
import type { Reservation } from './types'

export type ReservationPhase = 'UPCOMING' | 'IN_PROGRESS' | 'ENDED' | 'CANCELLED'

export const phaseLabels: Record<ReservationPhase, string> = {
  UPCOMING: '待开始',
  IN_PROGRESS: '时段内',
  ENDED: '已结束',
  CANCELLED: '已取消',
}

export function reservationPhase(
  reservation: Pick<Reservation, 'status' | 'reservation_date' | 'start_time' | 'end_time'>,
  now: Date = new Date(),
): ReservationPhase {
  if (reservation.status === 'CANCELLED') return 'CANCELLED'

  const current = shanghaiDateTime(now)
  if (reservation.reservation_date > current.date
    || (reservation.reservation_date === current.date && reservation.start_time > current.time)) {
    return 'UPCOMING'
  }
  if (reservation.reservation_date < current.date
    || (reservation.reservation_date === current.date && reservation.end_time <= current.time)) {
    return 'ENDED'
  }
  return 'IN_PROGRESS'
}
