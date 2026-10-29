import { ActionFeedback } from '../components/ActionFeedback'
import { VenueForm } from '../components/VenueForm'
import { bookingHref } from '../navigation'
import type { CreateVenueInput, Venue } from '../types'
import type { VenueDraft } from '../venueDraft'

interface CreateVenuePageProps {
  draft: VenueDraft
  onDraftChange: (draft: VenueDraft) => void
  isSubmitting: boolean
  actionError: string
  createdVenue: Venue | null
  onCreate: (input: CreateVenueInput) => Promise<void>
}

export function CreateVenuePage({ draft, onDraftChange, isSubmitting, actionError, createdVenue, onCreate }: CreateVenuePageProps) {
  return (
    <>
      <div className="overlay-heading">
        <h2 data-overlay-heading tabIndex={-1}>创建场地</h2>
        <p>填写场地信息并选择开放状态。</p>
      </div>
      <section className="panel venue-create-panel" aria-label="填写场地信息">
        <VenueForm draft={draft} onDraftChange={onDraftChange} isSubmitting={isSubmitting} onCreate={onCreate} />
        <ActionFeedback error={actionError} success={createdVenue ? `场地创建成功，编号 ${createdVenue.id}` : ''} />
        {createdVenue?.status === 'OPEN' && <a className="booking-records-link" href={bookingHref(createdVenue.id)}>预约{createdVenue.name} →</a>}
      </section>
    </>
  )
}
