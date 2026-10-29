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
      <div className="subpage-banner">
        <a className="back-link" href="#/">← 返回场地概览</a>
        <p className="eyebrow">场地管理</p>
        <h1 tabIndex={-1}>创建场地</h1>
        <p>填写场地基本信息，创建后即可在场地概览中查看。</p>
      </div>
      <section className="panel venue-create-panel" aria-labelledby="create-venue-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">新增场地</p>
            <h2 id="create-venue-heading">填写场地信息</h2>
            <p>开放场地可接受预约；停用场地仍会展示，但无法预约。</p>
          </div>
        </div>
        <VenueForm draft={draft} onDraftChange={onDraftChange} isSubmitting={isSubmitting} onCreate={onCreate} />
        <ActionFeedback error={actionError} success={createdVenue ? `场地创建成功，编号 ${createdVenue.id}` : ''} />
        {createdVenue?.status === 'OPEN' && <a className="booking-records-link" href={bookingHref(createdVenue.id)}>预约{createdVenue.name} →</a>}
      </section>
    </>
  )
}
