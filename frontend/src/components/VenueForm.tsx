import type { FormEvent } from 'react'
import type { CreateVenueInput, VenueStatus } from '../types'
import type { VenueDraft } from '../venueDraft'

interface VenueFormProps {
  draft: VenueDraft
  onDraftChange: (draft: VenueDraft) => void
  isSubmitting: boolean
  onCreate: (input: CreateVenueInput) => Promise<void>
}

export function VenueForm({ draft, onDraftChange, isSubmitting, onCreate }: VenueFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    void onCreate({
      name: draft.name.trim(),
      location: draft.location.trim(),
      capacity: Number(draft.capacity),
      open_time: draft.openTime,
      close_time: draft.closeTime,
      status: draft.status,
    })
  }

  return (
    <form aria-label="创建场地" onSubmit={handleSubmit} className="booking-form">
      <p className="form-intro">所有字段均为必填，提交结果会显示在表单下方。</p>
      <fieldset className="form-fields" disabled={isSubmitting}>
        <legend>场地资料</legend>
        <div className="form-grid">
          <label>
            场地名称
            <input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} maxLength={100} placeholder="例如：多功能排练室" required />
          </label>
          <label className="full-width">
            所在位置
            <input value={draft.location} onChange={(event) => onDraftChange({ ...draft, location: event.target.value })} maxLength={200} placeholder="例如：教学楼 3 层" required />
          </label>
          <label>
            可容纳人数
            <input type="number" min="1" max="2147483647" step="1" value={draft.capacity} onChange={(event) => onDraftChange({ ...draft, capacity: event.target.value })} required />
          </label>
          <label>
            场地状态
            <select value={draft.status} onChange={(event) => onDraftChange({ ...draft, status: event.target.value as VenueStatus })} required>
              <option value="OPEN">开放</option>
              <option value="CLOSED">停用</option>
            </select>
          </label>
          <label>
            开放时间
            <input type="time" value={draft.openTime} onChange={(event) => onDraftChange({ ...draft, openTime: event.target.value })} required />
          </label>
          <label>
            关闭时间
            <input type="time" value={draft.closeTime} onChange={(event) => onDraftChange({ ...draft, closeTime: event.target.value })} required />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">{isSubmitting ? '提交中…' : '提交场地'}</button>
          <p>每日开放时段按北京时间填写；关闭时间须晚于开放时间，不支持跨午夜。</p>
        </div>
      </fieldset>
    </form>
  )
}
