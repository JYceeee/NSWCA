import { add, addDays, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfToday, startOfWeek } from 'date-fns'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SaveBar } from '../brand/shared'
import { NumberField } from '../brand/TypographyTab'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { blankEvent, calView, dateRangeLabel, eventsOn, fmtDate, hourLabel, occursOn, timeLabel, toDate, WEEK } from '../data/events'
import { resolveColor } from '../lib/theme'
import { uid, useApplied, useBrand, useSelected } from '../store/BrandStore'
import type { CalEvent, CalMode, CalViewSettings } from '../types'
import { Popover } from '../components/Popover'
import { isDraft, isTournament } from '../data/eventDetails'
import { CategoriesDialog, EventForm } from './EventDialogs'
import { EntriesPage } from './EntriesPage'
import { EventDetailsPage, RichText } from './EventDetailsPage'
import { ExportDialog, ImportDialog, ImportExportMenu } from './ImportExport'
import { useEventBook } from './useEventBook'
import { WeekTimeGrid } from './WeekTimeGrid'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Pop = { kind: 'event'; id: string; rect: DOMRect } | { kind: 'day'; date: string; rect: DOMRect }

function useNarrow() {
  const q = '(max-width: 767px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mql = window.matchMedia(q)
    const h = () => setM(mql.matches)
    mql.addEventListener('change', h)
    return () => mql.removeEventListener('change', h)
  }, [])
  return m
}

const MODES: { id: CalMode; label: string }[] = [
  { id: 'week', label: 'One week' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'month', label: 'Month' },
]

/** First day shown for a mode: the month, or the week containing `d`. */
const periodStart = (mode: CalMode, d: Date) => (mode === 'month' ? startOfMonth(d) : startOfWeek(d, WEEK))

function rangeTitle(a: Date, b: Date) {
  if (isSameMonth(a, b)) return `${format(a, 'd')} – ${format(b, 'd MMMM yyyy')}`
  return a.getFullYear() === b.getFullYear() ? `${format(a, 'd MMM')} – ${format(b, 'd MMM yyyy')}` : `${format(a, 'd MMM yyyy')} – ${format(b, 'd MMM yyyy')}`
}

/** The calendar, or one event's full details page (#events/<id>). */
export function EventsPage() {
  const { ui } = useBrand()
  if (!ui.eventId) return <CalendarPage />
  if (ui.eventEntries) return <EntriesPage key={ui.eventId} id={ui.eventId} />
  return <EventDetailsPage key={ui.eventId} id={ui.eventId} edit={ui.eventEdit} />
}

function CalendarPage() {
  const book = useSelected('events')
  const { update, navigate } = useBrand()
  const { toast } = useDialogs()
  const palette = useApplied('palettes')
  const narrow = useNarrow()
  const today = startOfToday()
  const [rawMode, setRawMode] = useState<CalMode>('fortnight')
  // Phones always show the month list.
  const mode: CalMode = narrow ? 'month' : rawMode
  const [cursor, setCursor] = useState(() => periodStart('fortnight', today))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pop, setPop] = useState<Pop | null>(null)
  const [form, setForm] = useState<{ event: CalEvent; isNew: boolean } | null>(null)
  const [catsOpen, setCatsOpen] = useState(false)
  const [io, setIo] = useState<'import' | 'export' | null>(null)

  const view = calView(book)
  const byDay = mode === 'week' && view.byDay
  const month = startOfMonth(cursor)
  const start = mode === 'month' ? month : cursor
  const days =
    mode === 'month'
      ? eachDayOfInterval({ start: startOfWeek(month, WEEK), end: endOfWeek(endOfMonth(month), WEEK) })
      : eachDayOfInterval({ start, end: addDays(start, mode === 'week' ? 6 : 13) })
  const end = mode === 'month' ? endOfMonth(month) : days[days.length - 1]

  const q = query.trim().toLowerCase()
  const events = q ? book.events.filter((e) => e.name.toLowerCase().includes(q)) : book.events

  // Events and categories save straight away; only the view settings wait for the Save bar.
  const { commit } = useEventBook()
  const setView = (patch: Partial<CalViewSettings>) => update('events', book.id, (b) => ({ ...b, view: { ...calView(b), ...patch } }))
  const catColor = (id: string) => {
    const cat = book.categories.find((c) => c.id === id)
    return cat ? resolveColor(cat.color, palette.tokens) : 'var(--t-muted)'
  }
  const catName = (id: string) => book.categories.find((c) => c.id === id)?.name ?? 'No category'

  const switchMode = (m: CalMode) => {
    setRawMode(m)
    setCursor(periodStart(m, today))
  }
  const step = (dir: 1 | -1) => setCursor((c) => (mode === 'month' ? add(startOfMonth(c), { months: dir }) : addWeeks(c, dir * (mode === 'week' ? 1 : 2))))
  /** Moves the view so it includes `d` – unless it's already on screen (incl. the month view's outside days). */
  const show = (d: Date) => {
    const key = fmtDate(d)
    if (key >= fmtDate(days[0]) && key <= fmtDate(days[days.length - 1])) return
    setCursor(periodStart(mode, d))
  }

  const newEvent = (date = fmtDate(today >= start && today <= end ? today : start), hour?: number) => {
    setPop(null)
    const e = blankEvent(uid('ev'), date, book.categories[0]?.id ?? '')
    if (hour != null) Object.assign(e, { startTime: `${String(hour).padStart(2, '0')}:00`, endTime: hour >= 23 ? '23:59' : `${String(hour + 1).padStart(2, '0')}:00` })
    setForm({ event: e, isNew: true })
  }

  const saveEvent = (e: CalEvent) => {
    // A new tournament continues to step 2: its full details.
    if (form?.isNew && isTournament(e, book.categories)) {
      commit((b) => ({ ...b, events: [...b.events, e] }))
      setForm(null)
      return navigate({ page: 'events', eventId: e.id, eventEdit: true })
    }
    commit((b) => ({ ...b, events: form?.isNew ? [...b.events, e] : b.events.map((x) => (x.id === e.id ? e : x)) }))
    setForm(null)
    show(toDate(e.startDate))
  }

  const deleteEvent = (e: CalEvent) => {
    setPop(null)
    commit((b) => ({ ...b, events: b.events.filter((x) => x.id !== e.id) }))
    toast(`Deleted “${e.name}”`, { label: 'Undo', run: () => commit((b) => ({ ...b, events: [...b.events, e] })) })
  }

  const openEvent = (e: CalEvent, el: HTMLElement) => setPop({ kind: 'event', id: e.id, rect: el.getBoundingClientRect() })

  const card = (e: CalEvent, compact = false) => (
    <EventCard key={e.id} event={e} color={catColor(e.category)} compact={compact} draft={isDraft(e, book.categories)} onOpen={(el) => openEvent(e, el)} />
  )

  const popEvent = pop?.kind === 'event' ? book.events.find((e) => e.id === pop.id) : undefined
  const hourOptions = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).map((h) => (
      <option key={h} value={h}>
        {h === 24 ? '12 AM (midnight)' : hourLabel(h)}
      </option>
    ))

  return (
    <div className="brand-page events-page">
      <header className="page-head">
        <h1>Upcoming events</h1>
        <p>Tournaments, training, social nights and meetings. Double-click a day to add an event on it.</p>
      </header>

      {!narrow && (
        <div className="cal-toolbar">
          <div className="segmented" role="tablist" aria-label="Time period">
            {MODES.map((m) => (
              <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'seg seg--on' : 'seg'} onClick={() => switchMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'week' && (
            <label className="check cal-setting">
              <input type="checkbox" checked={view.byDay} onChange={(e) => setView({ byDay: e.target.checked })} />
              View by day
            </label>
          )}
          {byDay ? (
            <>
              <label className="cal-setting">
                Hours
                <select className="ui-input" value={view.startHour} onChange={(e) => setView({ startHour: Number(e.target.value) })} aria-label="Start hour">
                  {hourOptions(0, view.endHour - 1)}
                </select>
                –
                <select className="ui-input" value={view.endHour} onChange={(e) => setView({ endHour: Number(e.target.value) })} aria-label="End hour">
                  {hourOptions(view.startHour + 1, 24)}
                </select>
              </label>
              <label className="cal-setting">
                Hour height
                <NumberField value={view.hourHeight} min={20} max={200} onChange={(n) => n != null && setView({ hourHeight: n })} ariaLabel="Hour height in px" small />
                px
              </label>
            </>
          ) : (
            <label className="cal-setting">
              Cell height
              <NumberField
                value={view.cellHeight[mode]}
                min={60}
                max={900}
                onChange={(n) => n != null && setView({ cellHeight: { ...view.cellHeight, [mode]: n } })}
                ariaLabel="Cell height in px"
                small
              />
              px
            </label>
          )}
        </div>
      )}

      <div className="cal">
        <div className="cal-head">
          <div className="cal-today" aria-label={`Today is ${format(today, 'd MMMM yyyy')}`}>
            <span>{format(today, 'MMM')}</span>
            <strong>{format(today, 'd')}</strong>
          </div>
          <div className="cal-title">
            <h2>{mode === 'month' ? format(month, 'MMMM, yyyy') : rangeTitle(start, end)}</h2>
            <span>
              {mode === 'month' ? `${format(month, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}` : mode === 'week' ? 'One week' : 'Two weeks'}
            </span>
          </div>
          <div className="cal-actions">
            {searchOpen ? (
              <div className="cal-search">
                <Icon name="search" size={15} />
                <input autoFocus className="ui-input" placeholder="Search events" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), setSearchOpen(false))} />
                <button className="icon-btn" aria-label="Close search" onClick={() => (setQuery(''), setSearchOpen(false))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ) : (
              <button className="ui-btn cal-icon-btn" aria-label="Search events" onClick={() => setSearchOpen(true)}>
                <Icon name="search" size={16} />
              </button>
            )}
            <span className="cal-sep" />
            <div className="cal-nav">
              <button className="ui-btn" aria-label={`Previous ${mode === 'fortnight' ? 'two weeks' : mode}`} onClick={() => step(-1)}>
                <Icon name="chevronLeft" size={16} />
              </button>
              <button className="ui-btn" onClick={() => setCursor(periodStart(mode, today))}>
                Today
              </button>
              <button className="ui-btn" aria-label={`Next ${mode === 'fortnight' ? 'two weeks' : mode}`} onClick={() => step(1)}>
                <Icon name="chevron" size={16} />
              </button>
            </div>
            <span className="cal-sep" />
            <button className="ui-btn" onClick={() => setCatsOpen(true)}>
              <Icon name="tag" size={15} /> Categories
            </button>
            <ImportExportMenu onImport={() => setIo('import')} onExport={() => setIo('export')} />
            <button className="ui-btn ui-btn--primary" onClick={() => newEvent()}>
              <Icon name="plus" size={15} /> New event
            </button>
          </div>
        </div>

        {q && <SearchResults events={events} card={card} onGo={(e) => show(toDate(e.startDate))} />}

        {narrow ? (
          <MonthList month={month} events={events} card={card} />
        ) : byDay ? (
          <WeekTimeGrid days={days} events={events} view={view} color={catColor} draft={(e) => isDraft(e, book.categories)} card={card} onOpen={openEvent} onAdd={(date, hour) => newEvent(date, hour)} />
        ) : (
          <div className="cal-grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-weekday">
                {d}
              </div>
            ))}
            {days.map((day, i) => {
              const out = mode === 'month' && !isSameMonth(day, month)
              return (
                <DayCell
                  key={fmtDate(day)}
                  day={day}
                  list={eventsOn(events, day)}
                  height={view.cellHeight[mode]}
                  out={out}
                  label={monthLabel(day, i)}
                  onJump={out ? () => setCursor(startOfMonth(day)) : undefined}
                  card={card}
                  onAdd={() => newEvent(fmtDate(day))}
                  onMore={(rect) => setPop({ kind: 'day', date: fmtDate(day), rect })}
                />
              )
            })}
          </div>
        )}
      </div>

      <SaveBar slice="events" item={book} noReset />

      {pop?.kind === 'day' && (
        <Popover rect={pop.rect} onClose={() => setPop(null)} label="Events on this day">
          <div className="pop-day-title">{format(toDate(pop.date), 'EEEE d MMMM')}</div>
          <div className="pop-day-list">{eventsOn(events, toDate(pop.date)).map((e) => card(e))}</div>
        </Popover>
      )}
      {popEvent && pop && (
        <Popover rect={pop.rect} onClose={() => setPop(null)} label={popEvent.name}>
          <EventDetails
            event={popEvent}
            color={catColor(popEvent.category)}
            category={catName(popEvent.category)}
            onDelete={() => deleteEvent(popEvent)}
            onView={() => {
              setPop(null)
              navigate({ page: 'events', eventId: popEvent.id, eventEdit: false })
            }}
            draft={isDraft(popEvent, book.categories)}
          />
        </Popover>
      )}
      {form && <EventForm initial={form.event} isNew={form.isNew} categories={book.categories} onSave={saveEvent} onClose={() => setForm(null)} />}
      {catsOpen && <CategoriesDialog book={book} setBook={commit} onClose={() => setCatsOpen(false)} />}
      {io === 'import' && <ImportDialog book={book} commit={commit} onClose={() => setIo(null)} />}
      {io === 'export' && <ExportDialog book={book} shownFrom={start} onClose={() => setIo(null)} />}
    </div>
  )
}

/** Height of the "+N more" line kept free at the bottom of a full cell. */
const MORE_H = 22

/** "Oct" on the 1st of a month and on the first day shown; otherwise none. */
export const monthLabel = (day: Date, index: number) => (index === 0 || day.getDate() === 1 ? format(day, 'MMM') : undefined)

/** A day with as many cards as fit its height; the rest go behind "+N more". */
function DayCell({
  day, list, height, out, label, onJump, card, onAdd, onMore,
}: {
  day: Date
  list: CalEvent[]
  height: number
  out: boolean
  label?: string
  /** Days outside the month: clicking the date goes to their month. */
  onJump?: () => void
  card: (e: CalEvent) => ReactNode
  onAdd: () => void
  onMore: (rect: DOMRect) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState(0)

  // Measure after every render: show all cards, then hide the ones past the bottom.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const cards = [...el.querySelectorAll<HTMLElement>(':scope > .ev-card')]
    for (const c of cards) c.style.display = ''
    const avail = el.clientHeight
    const bottom = (c: HTMLElement) => c.offsetTop + c.offsetHeight
    let n = cards.length
    if (n && bottom(cards[n - 1]) > avail) {
      n = 0
      while (n < cards.length && bottom(cards[n]) <= avail - MORE_H) n++
    }
    cards.forEach((c, i) => (c.style.display = i < n ? '' : 'none'))
    setHidden(cards.length - n)
  })

  return (
    <div
      className={['cal-day', out && 'cal-day--out', isToday(day) && 'cal-day--today'].filter(Boolean).join(' ')}
      style={{ height }}
      onDoubleClick={onAdd}
      title="Double-click to add an event"
    >
      <div className="cal-day-top">
        {label && <span className="cal-month-label">{label}</span>}
        {onJump ? (
          <button className="cal-date cal-date--jump" title={`Go to ${format(day, 'MMMM yyyy')}`} onClick={onJump} onDoubleClick={(e) => e.stopPropagation()}>
            <time dateTime={fmtDate(day)}>{format(day, 'd')}</time>
          </button>
        ) : (
          <time dateTime={fmtDate(day)} className="cal-date">
            {format(day, 'd')}
          </time>
        )}
      </div>
      <div className="cal-day-events" ref={box}>
        {list.map((e) => card(e))}
        {hidden > 0 && (
          <button className="cal-more" onDoubleClick={(ev) => ev.stopPropagation()} onClick={(ev) => onMore(ev.currentTarget.getBoundingClientRect())}>
            + {hidden} more
          </button>
        )}
      </div>
    </div>
  )
}

function EventCard({ event, color, compact, draft, onOpen }: { event: CalEvent; color: string; compact?: boolean; draft?: boolean; onOpen: (el: HTMLElement) => void }) {
  return (
    <button
      className={['ev-card', compact && 'ev-card--compact', draft && 'ev-card--draft'].filter(Boolean).join(' ')}
      title={draft ? 'Draft – tournament details still missing' : undefined}
      style={{ '--ev': color } as CSSProperties}
      onClick={(e) => onOpen(e.currentTarget)}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span className="ev-name">{event.name}</span>
      <span className="ev-meta">{timeLabel(event)}</span>
      {event.location && <span className="ev-meta">{event.location}</span>}
    </button>
  )
}

function EventDetails({
  event, color, category, draft, onDelete, onView,
}: {
  event: CalEvent
  color: string
  category: string
  draft: boolean
  onDelete: () => void
  onView: () => void
}) {
  return (
    <div className="ev-details">
      <div className="ev-badges">
        <span className="ev-cat" style={{ '--ev': color } as CSSProperties}>
          {category}
        </span>
        {draft && <span className="ev-badge ev-badge--draft">Draft</span>}
        {event.memberOnly && <span className="ev-badge">Members only</span>}
        {event.citizensOnly && !/tournament/i.test(category) && <span className="ev-badge">AU & NZ citizens only</span>}
      </div>
      <h3>{event.name}</h3>
      <div className="ev-row">
        <Icon name="calendar" size={15} /> {dateRangeLabel(event)}
      </div>
      <div className="ev-row">
        <Icon name="clock" size={15} /> {timeLabel(event)}
      </div>
      {event.location && (
        <div className="ev-row">
          <Icon name="pinMap" size={15} /> {event.location}
        </div>
      )}
      {event.description && (
        <div className="ev-desc">
          <RichText text={event.description} />
        </div>
      )}
      <div className="ev-actions">
        <button className="ui-btn ui-btn--small ui-btn--primary" onClick={onView}>
          View Details
        </button>
        <button className="ui-btn ui-btn--small ui-btn--danger" onClick={onDelete}>
          <Icon name="trash" size={14} /> Delete
        </button>
      </div>
    </div>
  )
}

function SearchResults({ events, card, onGo }: { events: CalEvent[]; card: (e: CalEvent, compact?: boolean) => ReactNode; onGo: (e: CalEvent) => void }) {
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime))
  return (
    <div className="cal-results">
      <div className="cal-results-head">
        {sorted.length} {sorted.length === 1 ? 'event matches' : 'events match'} – the calendar shows only these.
      </div>
      <div className="cal-results-list">
        {sorted.map((e) => (
          <div key={e.id} className="cal-result">
            <button className="cal-result-date" onClick={() => onGo(e)} title="Show this month">
              {format(toDate(e.startDate), 'EEE d MMM yyyy')}
            </button>
            {card(e, true)}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Phones: the month's events as a list grouped by day. */
function MonthList({ month, events, card }: { month: Date; events: CalEvent[]; card: (e: CalEvent) => ReactNode }) {
  const days = eachDayOfInterval({ start: month, end: endOfMonth(month) }).filter((d) => events.some((e) => occursOn(e, d)))
  if (!days.length) return <p className="cal-empty">No events this month.</p>
  return (
    <div className="cal-list">
      {days.map((d) => (
        <section key={fmtDate(d)} className={isToday(d) ? 'cal-list-day cal-list-day--today' : 'cal-list-day'}>
          <h3>{format(d, 'EEEE d MMMM')}</h3>
          <div className="cal-list-events">{eventsOn(events, d).map((e) => card(e))}</div>
        </section>
      ))}
    </div>
  )
}
