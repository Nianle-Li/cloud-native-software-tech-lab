import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { bookingApi } from './api/booking'
import { ApiError } from './api/client'
import { useRoute } from './navigation'
import { BookingPage } from './pages/BookingPage'
import { CreateVenuePage } from './pages/CreateVenuePage'
import { HomePage } from './pages/HomePage'
import { ReservationsPage } from './pages/ReservationsPage'
import { ReservationDetailPage } from './pages/ReservationDetailPage'
import { VenueDetailPage } from './pages/VenueDetailPage'
import { emptyReservationDraft } from './reservationDraft'
import type { ReservationDraft } from './reservationDraft'
import type { CreateReservationInput, CreateVenueInput, Reservation, Venue } from './types'
import { validateReservation } from './validation/reservation'
import { validateVenue } from './validation/venue'
import { emptyVenueDraft } from './venueDraft'

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试'
}

function mutationErrorMessage(error: unknown, operation: string, refreshTarget = '预约记录'): string {
  if (error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.code === 'INVALID_RESPONSE')) {
    return `无法确认${operation}是否成功。请先刷新${refreshTarget}，确认结果后再决定是否重试。`
  }
  return messageFor(error)
}

function scrollToPageTop() {
  if (window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
}

export default function App() {
  const route = useRoute()
  const [venues, setVenues] = useState<Venue[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [draftByVenue, setDraftByVenue] = useState<Record<number, ReservationDraft>>({})
  const [venueDraft, setVenueDraft] = useState(emptyVenueDraft)
  const [venueCreationError, setVenueCreationError] = useState('')
  const [createdVenue, setCreatedVenue] = useState<Venue | null>(null)
  const [isCreatingVenue, setIsCreatingVenue] = useState(false)
  const [loadingVenues, setLoadingVenues] = useState(true)
  const [loadingReservations, setLoadingReservations] = useState(true)
  const [venueError, setVenueError] = useState('')
  const [reservationError, setReservationError] = useState('')
  const [bookingFeedback, setBookingFeedback] = useState<{ venueId: number; error: string; success: string } | null>(null)
  const [reservationFeedback, setReservationFeedback] = useState<{ reservationId: number; error: string; success: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [venueReloadKey, setVenueReloadKey] = useState(0)
  const [reservationReloadKey, setReservationReloadKey] = useState(0)
  const [reservationVisitKey, setReservationVisitKey] = useState(0)
  // 记录列表请求与成功写入的先后关系。
  const reservationRevision = useRef(0)
  const reservationMutationVersions = useRef(new Map<number, number>())
  const venueRevision = useRef(0)
  // 刷新结果不能清除在其发出之后产生的操作错误。
  const mutationRevision = useRef(0)
  const submittingRef = useRef(false)
  const creatingVenueRef = useRef(false)
  const cancellingRef = useRef(false)
  const previousRouteKind = useRef(route.kind)
  const skipNextReservationEntryRefresh = useRef(false)
  const routeKey = route.kind === 'booking' || route.kind === 'venueDetail'
    ? `${route.kind}:${route.venueId}`
    : route.kind === 'reservationDetail' ? `${route.kind}:${route.reservationId}` : route.kind
  const previousRouteKey = useRef(routeKey)
  useLayoutEffect(() => {
    scrollToPageTop()
    if (previousRouteKey.current !== routeKey) document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
    previousRouteKey.current = routeKey
  }, [routeKey])

  useEffect(() => {
    if (route.kind === 'reservations' && previousRouteKind.current !== 'reservations') {
      if (skipNextReservationEntryRefresh.current) {
        skipNextReservationEntryRefresh.current = false
      } else {
        setReservationVisitKey((current) => current + 1)
      }
    } else if (route.kind !== 'booking') {
      skipNextReservationEntryRefresh.current = false
    }
    previousRouteKind.current = route.kind
  }, [route.kind])

  useEffect(() => {
    let active = true
    const revision = ++venueRevision.current
    setLoadingVenues(true)
    setVenueError('')

    bookingApi.listVenues()
      .then((items) => {
        if (!active) return
        setVenues((current) => {
          if (revision === venueRevision.current) return items
          // 较早的列表响应仍可补齐已有场地，但不能丢失刚创建的场地。
          const returnedIds = new Set(items.map((item) => item.id))
          return [...items, ...current.filter((item) => !returnedIds.has(item.id))].sort((a, b) => a.id - b.id)
        })
      })
      .catch((error: unknown) => {
        if (active && revision === venueRevision.current) setVenueError(messageFor(error))
      })
      .finally(() => {
        if (active && revision === venueRevision.current) setLoadingVenues(false)
      })

    return () => { active = false }
  }, [venueReloadKey])

  useEffect(() => {
    let active = true
    const revision = ++reservationRevision.current
    const mutationAtStart = mutationRevision.current
    setLoadingReservations(true)
    setReservationError('')

    bookingApi.listReservations()
      .then((items) => {
        if (!active) return
        setReservations((current) => {
          if (revision === reservationRevision.current) return items
          // 仅保护请求发出后由本页确认写入的记录，其余记录采用服务端列表。
          const newerLocalItems = current.filter((item) => (reservationMutationVersions.current.get(item.id) ?? 0) > revision)
          const byId = new Map<number, Reservation>([...items, ...newerLocalItems].map((item) => [item.id, item]))
          return [...byId.values()].sort((a, b) => b.id - a.id)
        })
        if (revision === reservationRevision.current && reservationReloadKey > 0 && mutationAtStart === mutationRevision.current) {
          setReservationFeedback((current) => current ? { ...current, error: '' } : current)
        }
      })
      .catch((error: unknown) => {
        if (active && revision === reservationRevision.current) setReservationError(messageFor(error))
      })
      .finally(() => {
        if (active && revision === reservationRevision.current) setLoadingReservations(false)
      })

    return () => { active = false }
  }, [reservationReloadKey, reservationVisitKey])

  const bookingVenue = route.kind === 'booking'
    ? venues.find((venue) => venue.id === route.venueId) ?? null
    : null

  useEffect(() => {
    const pageName = route.kind === 'booking'
      ? `预约${bookingVenue ? ` ${bookingVenue.name}` : '场地'}`
      : route.kind === 'createVenue' ? '创建场地'
        : route.kind === 'venueDetail' ? '场地详情'
          : route.kind === 'reservationDetail' ? '预约详情'
        : route.kind === 'reservations' ? '预约记录' : route.kind === 'home' ? '场地概览' : '页面不存在'
    document.title = `${pageName} | 场地预约系统`
  }, [routeKey, bookingVenue?.name])

  async function createVenue(input: CreateVenueInput): Promise<void> {
    if (creatingVenueRef.current) return
    setVenueCreationError('')
    setCreatedVenue(null)
    const validationError = validateVenue(input)[0]?.message
    if (validationError) {
      setVenueCreationError(validationError)
      return
    }

    creatingVenueRef.current = true
    setIsCreatingVenue(true)
    try {
      const created = await bookingApi.createVenue(input)
      venueRevision.current += 1
      setVenues((current) => [...current.filter((item) => item.id !== created.id), created].sort((a, b) => a.id - b.id))
      setVenueError('')
      setLoadingVenues(false)
      setCreatedVenue(created)
      setVenueDraft(emptyVenueDraft())
    } catch (error) {
      setVenueCreationError(mutationErrorMessage(error, '创建场地', '场地列表'))
    } finally {
      creatingVenueRef.current = false
      setIsCreatingVenue(false)
    }
  }

  async function createReservation(input: CreateReservationInput): Promise<boolean> {
    if (submittingRef.current) return false
    setBookingFeedback({ venueId: input.venue_id, error: '', success: '' })
    mutationRevision.current += 1
    const venue = venues.find((item) => item.id === input.venue_id)
    const validationError = venue
      ? validateReservation(input, venue)[0]?.message
      : '场地不可预约，请刷新场地列表'
    if (validationError) {
      setBookingFeedback({ venueId: input.venue_id, error: validationError, success: '' })
      return false
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const created = await bookingApi.createReservation(input)
      reservationRevision.current += 1
      reservationMutationVersions.current.set(created.id, reservationRevision.current)
      setReservations((current) => [created, ...current.filter((item) => item.id !== created.id)])
      setReservationError('')
      setLoadingReservations(false)
      skipNextReservationEntryRefresh.current = true
      setBookingFeedback({ venueId: input.venue_id, error: '', success: `预约成功，编号 ${created.id}` })
      return true
    } catch (error) {
      setBookingFeedback({ venueId: input.venue_id, error: mutationErrorMessage(error, '预约'), success: '' })
      return false
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  async function cancelReservation(id: number): Promise<void> {
    if (cancellingRef.current) return
    cancellingRef.current = true
    setReservationFeedback({ reservationId: id, error: '', success: '' })
    mutationRevision.current += 1
    setCancellingId(id)
    try {
      const updated = await bookingApi.cancelReservation(id)
      reservationRevision.current += 1
      reservationMutationVersions.current.set(id, reservationRevision.current)
      setReservations((current) => current.map((item) => item.id === id ? updated : item))
      setReservationError('')
      setLoadingReservations(false)
      setReservationFeedback({ reservationId: id, error: '', success: `预约 ${id} 已取消` })
    } catch (error) {
      setReservationFeedback({ reservationId: id, error: mutationErrorMessage(error, '取消预约'), success: '' })
    } finally {
      cancellingRef.current = false
      setCancellingId(null)
    }
  }

  return (
    <div className="page-frame">
      <header className="site-header">
        <a className="brand" href="#/" aria-label="场地预约系统，返回场地概览">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
          <span className="brand-name">场地预约<span>Venue Booking</span></span>
        </a>
        <nav className="site-nav" aria-label="页面导航">
          <a href="#/" aria-current={route.kind === 'home' ? 'page' : undefined} onClick={route.kind === 'home' ? scrollToPageTop : undefined}>场地概览</a>
          <a href="#/venues/new" aria-current={route.kind === 'createVenue' ? 'page' : undefined} onClick={route.kind === 'createVenue' ? scrollToPageTop : undefined}>创建场地</a>
          <a href="#/reservations" aria-current={route.kind === 'reservations' ? 'page' : undefined} onClick={route.kind === 'reservations' ? scrollToPageTop : undefined}>预约记录</a>
        </nav>
      </header>

      <main className="app-shell">
        {route.kind === 'home' && (
          <HomePage
            venues={venues}
            loadingVenues={loadingVenues}
            venueError={venueError}
            onRefreshVenues={() => setVenueReloadKey((current) => current + 1)}
          />
        )}

        {route.kind === 'booking' && (
          <BookingPage
            venue={bookingVenue}
            draft={draftByVenue[route.venueId] ?? emptyReservationDraft()}
            onDraftChange={(draft) => setDraftByVenue((current) => ({ ...current, [route.venueId]: draft }))}
            loadingVenues={loadingVenues}
            venueError={venueError}
            isSubmitting={isSubmitting}
            actionError={bookingFeedback?.venueId === route.venueId ? bookingFeedback.error : ''}
            successMessage={bookingFeedback?.venueId === route.venueId ? bookingFeedback.success : ''}
            onRefreshVenues={() => setVenueReloadKey((current) => current + 1)}
            onCreate={createReservation}
          />
        )}

        {route.kind === 'createVenue' && (
          <CreateVenuePage
            draft={venueDraft}
            onDraftChange={setVenueDraft}
            isSubmitting={isCreatingVenue}
            actionError={venueCreationError}
            createdVenue={createdVenue}
            onCreate={createVenue}
          />
        )}

        {route.kind === 'venueDetail' && <VenueDetailPage venueId={route.venueId} />}

        {route.kind === 'reservationDetail' && <ReservationDetailPage reservationId={route.reservationId} venues={venues} />}

        {route.kind === 'reservations' && (
          <ReservationsPage
            reservations={reservations}
            venues={venues}
            loadingReservations={loadingReservations}
            reservationError={reservationError}
            cancellingId={cancellingId}
            feedbackReservationId={reservationFeedback?.reservationId ?? null}
            actionError={reservationFeedback?.error ?? ''}
            successMessage={reservationFeedback?.success ?? ''}
            onRefreshReservations={() => setReservationReloadKey((current) => current + 1)}
            onCancel={cancelReservation}
          />
        )}

        {route.kind === 'notFound' && (
          <section className="panel not-found-panel">
            <p className="section-kicker">页面不存在</p>
            <h1 tabIndex={-1}>无法打开这个页面</h1>
            <p>请从场地概览重新选择场地。</p>
            <a className="detail-book-link" href="#/">返回场地概览</a>
          </section>
        )}
        <footer className="site-footer">场地预约系统</footer>
      </main>
    </div>
  )
}
