import { useEffect, useState } from 'react'
import { bookingApi } from './api/booking'
import { ReservationForm } from './components/ReservationForm'
import { ReservationList } from './components/ReservationList'
import { VenueList } from './components/VenueList'
import type { CreateReservationInput, Reservation, Venue } from './types'

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

export default function App() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState<number | null>(null)
  const [showVenueDetails, setShowVenueDetails] = useState(false)
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [loadingReservations, setLoadingReservations] = useState(true)
  const [venueError, setVenueError] = useState('')
  const [reservationError, setReservationError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    bookingApi.listVenues()
      .then((items) => {
        if (!active) return
        setVenues(items)
        setSelectedVenueId(items.find((venue) => venue.status === 'OPEN')?.id ?? items[0]?.id ?? null)
      })
      .catch((error: unknown) => {
        if (active) setVenueError(messageFor(error))
      })
      .finally(() => {
        if (active) setLoadingVenues(false)
      })

    bookingApi.listReservations()
      .then((items) => {
        if (active) setReservations(items)
      })
      .catch((error: unknown) => {
        if (active) setReservationError(messageFor(error))
      })
      .finally(() => {
        if (active) setLoadingReservations(false)
      })

    return () => { active = false }
  }, [])

  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? null

  async function createReservation(input: CreateReservationInput): Promise<boolean> {
    setIsSubmitting(true)
    setActionError('')
    setSuccessMessage('')
    try {
      const created = await bookingApi.createReservation(input)
      setReservations((current) => [created, ...current])
      setSuccessMessage(`预约成功，编号 ${created.id}`)
      return true
    } catch (error) {
      setActionError(messageFor(error))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  async function cancelReservation(id: number): Promise<void> {
    setCancellingId(id)
    setActionError('')
    setSuccessMessage('')
    try {
      const updated = await bookingApi.cancelReservation(id)
      setReservations((current) => current.map((item) => item.id === id ? updated : item))
      setSuccessMessage(`预约 ${id} 已取消`)
    } catch (error) {
      setActionError(messageFor(error))
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <main className="app-shell">
      <header className="page-header">
        <p className="eyebrow">云原生软件技术 · Lab 1</p>
        <h1>场地预约系统</h1>
        <p>查看场地、创建预约并管理预约记录。</p>
      </header>

      {actionError && <p role="alert" className="notice error">{actionError}</p>}
      {successMessage && <p role="status" className="notice success">{successMessage}</p>}

      <section aria-labelledby="venues-heading" className="panel">
        <div className="section-heading">
          <h2 id="venues-heading">场地列表</h2>
          <p>选择场地查看开放时间和可容纳人数。</p>
        </div>
        {loadingVenues ? <p>正在加载场地…</p> : venueError ? <p role="alert" className="notice error">{venueError}</p> : (
          <VenueList
            venues={venues}
            selectedVenueId={selectedVenueId}
            onSelect={(id) => {
              setSelectedVenueId(id)
              setShowVenueDetails(true)
            }}
          />
        )}
        {showVenueDetails && selectedVenue && (
          <div className="venue-details">
            <h3>{selectedVenue.name} · 场地详情</h3>
            <p>{selectedVenue.location}</p>
            <p>开放时间：{selectedVenue.open_time}–{selectedVenue.close_time}</p>
            <p>可容纳人数：{selectedVenue.capacity}</p>
            <p>状态：{selectedVenue.status === 'OPEN' ? '开放中' : '已停用'}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="booking-heading" className="panel">
        <div className="section-heading">
          <h2 id="booking-heading">预约场地</h2>
          <p>最终是否可预约由服务器核验；提交后会显示结果。</p>
        </div>
        {selectedVenue?.status === 'OPEN' ? (
          <ReservationForm key={selectedVenue.id} venue={selectedVenue} isSubmitting={isSubmitting} onCreate={createReservation} />
        ) : (
          <p className="empty-state">{selectedVenue ? '该场地已停用，无法预约。' : '请先选择一个开放中的场地。'}</p>
        )}
      </section>

      <section aria-labelledby="reservations-heading" className="panel">
        <div className="section-heading">
          <h2 id="reservations-heading">预约记录</h2>
          <p>已取消的记录会保留，状态以服务器返回值为准。</p>
        </div>
        {loadingReservations ? <p>正在加载预约记录…</p> : reservationError ? <p role="alert" className="notice error">{reservationError}</p> : (
          <ReservationList reservations={reservations} venues={venues} cancellingId={cancellingId} onCancel={cancelReservation} />
        )}
      </section>
    </main>
  )
}
