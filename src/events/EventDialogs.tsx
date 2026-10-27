import { useState } from 'react'
import { ColorField } from '../brand/ComponentsTab'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { inRange, toDate, WEEKDAYS } from '../data/events'
import { RichTextEditor } from '../components/RichTextEditor'
import { isTournament } from '../data/eventDetails'
import { uid, useApplied } from '../store/BrandStore'
import type { CalEvent, EventBook, EventCategory } from '../types'

/** New / edit event. Changes go to the draft – the page's Save bar keeps them. */
export function EventForm({ initial, isNew, categories, onSave, onClose }: { initial: CalEvent; isNew: boolean; categories: EventCategory[]; onSave: (e: CalEvent) => void; onClose: () => void }) {
  const [e, setE] = useState(initial)
  const set = (patch: Partial<CalEvent>) => setE((x) => ({ ...x, ...patch }))

  const error = !e.name.trim()
    ? 'Give the event a name.'
    : e.endDate < e.startDate
      ? 'The end date is before the start date.'
      : e.weekdays && !e.weekdays.length
        ? 'Choose at least one day for “On selected day”.'
        : e.weekdays && !inRange(e, toDate(e.startDate), toDate(e.endDate))
          ? 'None of the chosen days falls between the start and end dates.'
          : !e.allDay && (e.endDate === e.startDate || e.weekdays) && e.endTime <= e.startTime
        ? 'The end time is before the start time.'
        : null
  const [tried, setTried] = useState(false)

  const submit = () => {
    setTried(true)
    if (!error)
      onSave({ ...e, name: e.name.trim(), location: e.location.trim(), description: e.description, citizensOnly: isTournament(e, categories) ? false : e.citizensOnly })
  }

  return (
    <Modal title={isNew ? 'New event' : 'Edit event'} onClose={onClose} width={520}>
      <div className="modal-body form ev-form">
        <label className="form-row">
          <span>Name</span>
          <input className="ui-input" value={e.name} autoFocus onChange={(x) => set({ name: x.target.value })} onKeyDown={(x) => x.key === 'Enter' && submit()} />
        </label>
        <div className="ev-form-pair">
          <label className="form-row">
            <span>Start date</span>
            <input
              type="date"
              className="ui-input"
              value={e.startDate}
              onChange={(x) => x.target.value && set({ startDate: x.target.value, endDate: e.endDate < x.target.value ? x.target.value : e.endDate })}
            />
          </label>
          <label className="form-row">
            <span>End date</span>
            <input type="date" className="ui-input" value={e.endDate} min={e.startDate} onChange={(x) => x.target.value && set({ endDate: x.target.value })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={e.allDay} onChange={(x) => set({ allDay: x.target.checked })} />
          All day
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!e.weekdays}
            // Start with the start date's weekday.
            onChange={(x) => set({ weekdays: x.target.checked ? [toDate(e.startDate).getDay()] : undefined })}
          />
          On selected day
        </label>
        {e.weekdays && (
          <div className="ev-weekdays" role="group" aria-label="Repeat on">
            {WEEKDAYS.map((w) => {
              const on = e.weekdays!.includes(w.day)
              return (
                <button
                  key={w.day}
                  type="button"
                  aria-pressed={on}
                  className={on ? 'ev-weekday ev-weekday--on' : 'ev-weekday'}
                  onClick={() => set({ weekdays: on ? e.weekdays!.filter((d) => d !== w.day) : [...e.weekdays!, w.day] })}
                >
                  {w.short}
                </button>
              )
            })}
            <span className="muted small">Repeats on these days between the start and end dates.</span>
          </div>
        )}
        {!e.allDay && (
          <div className="ev-form-pair">
            <label className="form-row">
              <span>Start time</span>
              <input type="time" className="ui-input" value={e.startTime} onChange={(x) => x.target.value && set({ startTime: x.target.value })} />
            </label>
            <label className="form-row">
              <span>End time</span>
              <input type="time" className="ui-input" value={e.endTime} onChange={(x) => x.target.value && set({ endTime: x.target.value })} />
            </label>
          </div>
        )}
        <label className="form-row">
          <span>Location</span>
          <input className="ui-input" value={e.location} placeholder="Optional" onChange={(x) => set({ location: x.target.value })} />
        </label>
        <label className="form-row">
          <span>Category</span>
          <select className="ui-input" value={e.category} onChange={(x) => set({ category: x.target.value })}>
            {!categories.some((c) => c.id === e.category) && <option value={e.category}>No category</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ev-form-checks">
          <label className="check">
            <input type="checkbox" checked={!!e.memberOnly} onChange={(x) => set({ memberOnly: x.target.checked })} />
            Member only
          </label>
          {/* Not offered for tournaments. */}
          {!isTournament(e, categories) && (
            <label className="check">
              <input type="checkbox" checked={!!e.citizensOnly} onChange={(x) => set({ citizensOnly: x.target.checked })} />
              Citizen of Australia and New Zealand only
            </label>
          )}
        </div>
        <div className="form-row">
          <span>Description</span>
          <RichTextEditor value={e.description} onChange={(description) => set({ description })} ariaLabel="Description" placeholder="Optional" minHeight={90} />
        </div>
        {tried && error && <p className="form-error">{error}</p>}
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Cancel</button>
        <button className="ui-btn ui-btn--primary" onClick={submit}>{isNew ? 'Add event' : 'Done'}</button>
      </div>
    </Modal>
  )
}

/** Add, rename, recolour (palette token) and delete categories. */
export function CategoriesDialog({ book, setBook, onClose }: { book: EventBook; setBook: (fn: (b: EventBook) => EventBook) => void; onClose: () => void }) {
  const palette = useApplied('palettes')
  const { confirm } = useDialogs()
  const patch = (id: string, p: Partial<EventCategory>) => setBook((b) => ({ ...b, categories: b.categories.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  const add = () => setBook((b) => ({ ...b, categories: [...b.categories, { id: uid('cat'), name: 'New category', color: { token: 'chart-1', alpha: 100 } }] }))
  const remove = async (c: EventCategory) => {
    const used = book.events.filter((e) => e.category === c.id).length
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      message: used ? `${used} event${used === 1 ? '' : 's'} use it and will show as “No category”.` : 'No events use it.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) setBook((b) => ({ ...b, categories: b.categories.filter((x) => x.id !== c.id) }))
  }

  return (
    <Modal title="Categories" onClose={onClose} width={720}>
      <div className="modal-body">
        <p className="muted small" style={{ marginTop: 0 }}>
          Colours follow a palette token unless you pick a custom colour. Changes are saved straight away.
        </p>
        <div className="cat-list">
          {book.categories.map((c) => (
            <div key={c.id} className="cat-row">
              <input className="ui-input cat-name" value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} aria-label="Category name" />
              <ColorField value={c.color} tokens={palette.tokens} onChange={(color) => patch(c.id, { color })} />
              <button className="icon-btn icon-btn--danger" title="Delete category" onClick={() => remove(c)}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
        <button className="ui-btn add-row" onClick={add}>
          <Icon name="plus" size={15} /> Add category
        </button>
      </div>
      <div className="modal-actions">
        <button className="ui-btn ui-btn--primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}
