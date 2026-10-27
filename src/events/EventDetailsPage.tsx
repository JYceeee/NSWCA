import { format, isAfter, parseISO } from 'date-fns'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { RichTextEditor } from '../components/RichTextEditor'
import { Icon } from '../components/Icon'
import {
  detailsOf, entriesCloseAt, fideRatingFor, TIME_TYPES, isAuNzCitizen, isDraft, isTournament, mapsUrl, memberOn, missingSections, SECTIONS, sectionFilled, type SectionDef,
} from '../data/eventDetails'
import { dateRangeLabel, fmtTime, timeLabel, toDate } from '../data/events'
import { toHtml, toPlain } from '../lib/richtext'
import { resolveColor } from '../lib/theme'
import { emptyProfile, validate } from '../profile/ProfilePage'
import { uid, useApplied, useBrand } from '../store/BrandStore'
import type { CalEvent, EventDetailsData, EventEntry } from '../types'
import { EventForm } from './EventDialogs'
import { byeFor, byeValues, fedCode, isReleased, scheduledRounds } from '../pairing/engine'
import { PairingsSection } from './PairingsSection'
import { AddPlayerDialog, ImportPlayersDialog } from './PlayersDialogs'
import { useEventBook } from './useEventBook'

/** Full page for one event: summary header, sections with side contents, entering; or the details editor. */
export function EventDetailsPage({ id, edit }: { id: string; edit: boolean }) {
  const { book, commit } = useEventBook()
  const { navigate } = useBrand()
  const [basicOpen, setBasicOpen] = useState(false)
  const event = book.events.find((e) => e.id === id)
  const back = () => navigate({ page: 'events', eventId: null, eventEdit: false })

  if (!event)
    return (
      <div className="brand-page ed-page">
        <button className="ui-btn ui-btn--small ed-back" onClick={back}>
          <Icon name="chevronLeft" size={14} /> Back to calendar
        </button>
        <p className="muted">This event no longer exists.</p>
      </div>
    )

  const tournament = isTournament(event, book.categories)
  const setEvent = (fn: (e: CalEvent) => CalEvent) => commit((b) => ({ ...b, events: b.events.map((x) => (x.id === id ? fn(x) : x)) }))

  return (
    <div className="brand-page ed-page">
      {edit && tournament ? (
        <DetailsEditor event={event} onDone={() => navigate({ page: 'events', eventId: id, eventEdit: false })} save={(details) => setEvent((e) => ({ ...e, details }))} />
      ) : (
        <DetailsView
          event={event}
          tournament={tournament}
          onBack={back}
          onEdit={() => (tournament ? navigate({ page: 'events', eventId: id, eventEdit: true }) : setBasicOpen(true))}
          onEditBasic={() => setBasicOpen(true)}
          setEvent={setEvent}
        />
      )}
      {basicOpen && (
        <EventForm
          initial={event}
          isNew={false}
          categories={book.categories}
          onClose={() => setBasicOpen(false)}
          onSave={(e) => {
            setEvent(() => e)
            setBasicOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ---------- Text with simple formatting ----------

/** Formatted text (or older plain text) shown safely. */
export function RichText({ text }: { text: string }) {
  return <div className="ed-text" dangerouslySetInnerHTML={{ __html: toHtml(text) }} />
}

// ---------- View ----------

type EntryState =
  | { kind: 'register'; url: string }
  | { kind: 'entered'; entry: EventEntry }
  | { kind: 'open' }
  | { kind: 'blocked'; reason: string; profileLink?: boolean }

function useEntryState(event: CalEvent, tournament: boolean): EntryState {
  const { saved } = useBrand()
  const { book } = useEventBook()
  const profile = { ...emptyProfile(), ...saved.profile }
  const d = detailsOf(event)
  if (tournament && isDraft(event, book.categories)) return { kind: 'blocked', reason: 'Entries open once the tournament details are complete' }
  if (d.registrationUrl.trim()) return { kind: 'register', url: d.registrationUrl.trim() }
  const mine = profile.email && event.entries?.find((x) => x.email.toLowerCase() === profile.email.toLowerCase())
  if (mine) return { kind: 'entered', entry: mine }
  if (isAfter(new Date(), entriesCloseAt(event))) return { kind: 'blocked', reason: 'Entries closed' }
  if (Object.keys(validate(profile)).length) return { kind: 'blocked', reason: 'Complete your profile to enter', profileLink: true }
  if (event.memberOnly && !memberOn(profile, toDate(event.startDate))) return { kind: 'blocked', reason: 'Members only – your membership isn’t valid on the event date' }
  if (event.citizensOnly && !tournament && !isAuNzCitizen(profile)) return { kind: 'blocked', reason: 'Australian and New Zealand citizens only' }
  return { kind: 'open' }
}

function DetailsView({
  event, tournament, onBack, onEdit, onEditBasic, setEvent,
}: {
  event: CalEvent
  tournament: boolean
  onBack: () => void
  onEdit: () => void
  onEditBasic: () => void
  setEvent: (fn: (e: CalEvent) => CalEvent) => void
}) {
  const { book } = useEventBook()
  const { saved, navigate } = useBrand()
  const { toast } = useDialogs()
  const palette = useApplied('palettes')
  const profile = { ...emptyProfile(), ...saved.profile }
  const d = detailsOf(event)
  const cat = book.categories.find((c) => c.id === event.category)
  const draft = tournament && isDraft(event, book.categories)
  const missing = missingSections(event, book.categories)
  const state = useEntryState(event, tournament)
  const [choosing, setChoosing] = useState(false)
  /** Organiser: add one player or import a players file. */
  const [players, setPlayers] = useState<'add' | 'import' | null>(null)
  /** Once pairings are released, the entry list is frozen. */
  const entriesLocked = (event.pairings ?? []).length > 0
  /** Withdrawing goes through the organiser – this window shows how to reach them. */
  const [withdrawing, setWithdrawing] = useState(false)
  const showEntries = !d.registrationUrl.trim()

  const sections = tournament ? SECTIONS.filter((s) => s.kind !== 'url' && sectionFilled(d, s)) : []
  const nav = [
    ...sections.map((s) => ({ id: s.id, label: s.label })),
    ...(tournament ? [{ id: 'pairings', label: 'Pairings' }, { id: 'results', label: 'Results' }] : []),
    ...(showEntries ? [{ id: 'entries', label: 'View entries' }] : []),
  ]

  const enter = (division: string) => {
    const entry: EventEntry = {
      id: uid('entry'),
      name: [profile.firstName, profile.lastName].join(' ').trim(),
      email: profile.email,
      fideId: profile.fideId,
      acfId: profile.acfId,
      fideStandard: profile.fideStandard ?? '',
      fideRapid: profile.fideRapid ?? '',
      fideBlitz: profile.fideBlitz ?? '',
      acfRating: profile.acfRating ?? '',
      fed: (profile.federation || fedCode(profile.citizenship)).toUpperCase(),
      kFide: profile.kFide ?? '',
      title: profile.title ?? '',
      dob: profile.dob,
      gender: profile.sex === 'Male' ? 'M' : profile.sex === 'Female' ? 'F' : '',
      source: 'signup',
      division,
      at: new Date().toISOString(),
    }
    setEvent((e) => ({ ...e, entries: [...(e.entries ?? []), entry] }))
    setChoosing(false)
    toast('You’re entered')
  }


  const entryButton = (() => {
    switch (state.kind) {
      case 'register':
        return (
          <a className="ui-btn ui-btn--primary" href={state.url} target="_blank" rel="noreferrer">
            Register <Icon name="link" size={14} />
          </a>
        )
      case 'entered':
        return (
          <div className="ed-entered">
            <span className="ev-badge ev-badge--ok">
              <Icon name="check" size={13} /> You’re entered{state.entry.division ? ` – ${d.divisions.find((x) => x.id === state.entry.division)?.name ?? ''}` : ''}
            </span>
            <button className="ui-btn ui-btn--small" onClick={() => setWithdrawing(true)}>
              Withdraw
            </button>
          </div>
        )
      case 'open':
        return (
          <button className="ui-btn ui-btn--primary" onClick={() => (tournament && d.divisions.some((x) => x.name.trim()) ? setChoosing(true) : enter(''))}>
            Enter
          </button>
        )
      case 'blocked':
        return (
          <div className="ed-blocked">
            <button className="ui-btn ui-btn--primary" disabled>
              Enter
            </button>
            <span>
              {state.reason}
              {state.profileLink && (
                <>
                  {' – '}
                  <a href="#profile" onClick={(e) => (e.preventDefault(), navigate({ page: 'profile' }))}>
                    go to Profile
                  </a>
                </>
              )}
            </span>
          </div>
        )
    }
  })()

  return (
    <>
      <button className="ui-btn ui-btn--small ed-back" onClick={onBack}>
        <Icon name="chevronLeft" size={14} /> Back to calendar
      </button>
      <header className="ed-head">
        <div className="ev-badges">
          <span className="ev-cat" style={{ '--ev': cat ? resolveColor(cat.color, palette.tokens) : 'var(--t-muted)' } as CSSProperties}>
            {cat?.name ?? 'No category'}
          </span>
          {draft && <span className="ev-badge ev-badge--draft">Draft – details missing</span>}
          {event.memberOnly && <span className="ev-badge">Members only</span>}
          {event.citizensOnly && !tournament && <span className="ev-badge">AU & NZ citizens only</span>}
        </div>
        <h1>{event.name}</h1>
        <div className="ed-facts">
          <span>
            <Icon name="calendar" size={15} /> {dateRangeLabel(event)}
          </span>
          <span>
            <Icon name="clock" size={15} /> {timeLabel(event)}
          </span>
          {(d.venue.name || event.location) && (
            <span>
              <Icon name="pinMap" size={15} /> {d.venue.name || event.location}
            </span>
          )}
          {state.kind !== 'register' && (
            <span>
              <Icon name="clock" size={15} /> Entries close {format(entriesCloseAt(event), 'EEE d MMM yyyy, h:mm a')}
            </span>
          )}
        </div>
        <div className="ed-actions">
          {entryButton}
          <span className="ed-actions-gap" />
          {tournament && (
            <button className="ui-btn" onClick={onEditBasic}>
              Edit name & dates
            </button>
          )}
          <button className="ui-btn ui-btn--primary" onClick={onEdit}>
            <Icon name="edit" size={15} /> Edit details
          </button>
        </div>
        {draft && (
          <p className="ed-missing">
            Still needed: {missing.map((s) => s.label).join(', ')}.
          </p>
        )}
      </header>

      <div className="ed-body">
        {nav.length > 1 && (
          <nav className="ed-toc" aria-label="On this page">
            <span>On this page</span>
            {nav.map((n) => (
              <a key={n.id} href={`#ed-${n.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(`ed-${n.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
                {n.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ed-sections">
          {!tournament && (
            <section className="ed-section">
              <h2>Event details</h2>
              {event.description ? <RichText text={event.description} /> : <p className="muted">No description yet.</p>}
              <p className="muted small">More details for this type of event are coming later.</p>
            </section>
          )}
          {sections.map((s) => (
            <section key={s.id} id={`ed-${s.id}`} className="ed-section">
              <h2>{s.label}</h2>
              <SectionView s={s} d={d} roundAction={(n) => <ByeButton event={event} round={n} setEvent={setEvent} />} />
            </section>
          ))}
          {tournament && <PairingsSection mode="pairings" event={event} you={profile.email} setEvent={setEvent} />}
          {tournament && <PairingsSection mode="results" event={event} you={profile.email} setEvent={setEvent} />}
        </div>
        {/* Right-hand column, stays in view while scrolling (below the sections on narrow screens). */}
        {showEntries && (
          <aside className="ed-side">
            <section id="ed-entries" className="ed-section">
              <div className="ed-section-head">
                <h2>View entries</h2>
                <div className="ed-section-actions">
                  <button className="ui-btn ui-btn--small" disabled={entriesLocked} title={entriesLocked ? 'Pairings released – entries are locked' : undefined} onClick={() => setPlayers('add')}>
                    <Icon name="plus" size={14} /> Add
                  </button>
                  <button className="ui-btn ui-btn--small" disabled={entriesLocked} title={entriesLocked ? 'Pairings released – entries are locked' : undefined} onClick={() => setPlayers('import')}>
                    <Icon name="upload" size={14} /> Import
                  </button>
                </div>
              </div>
              <EntriesList event={event} d={d} you={profile.email} />
              <button className="ui-btn ui-btn--small ed-all-entries" onClick={() => navigate({ page: 'events', eventId: event.id, eventEdit: false, eventEntries: true })}>
                View all entries <Icon name="chevron" size={14} />
              </button>
            </section>
          </aside>
        )}
      </div>

      {players === 'add' && <AddPlayerDialog event={event} onClose={() => setPlayers(null)} />}
      {players === 'import' && <ImportPlayersDialog event={event} setEvent={setEvent} onClose={() => setPlayers(null)} />}
      {withdrawing && (
        <Modal title="Withdraw from this event?" onClose={() => setWithdrawing(false)} width={440}>
          <div className="modal-body">
            <p style={{ marginTop: 0 }}>Please contact the organiser through the contact details to withdraw.</p>
            {d.contact.name || d.contact.email || d.contact.phone ? (
              <div className="ed-lines ed-withdraw-contact">
                {d.contact.name && <strong>{d.contact.name}</strong>}
                {d.contact.email && <a href={`mailto:${d.contact.email}?subject=${encodeURIComponent(`Withdraw: ${event.name}`)}`}>{d.contact.email}</a>}
                {d.contact.phone && <a href={`tel:${d.contact.phone.replace(/[^\d+]/g, '')}`}>{d.contact.phone}</a>}
              </div>
            ) : (
              <p className="muted">This event has no contact details yet.</p>
            )}
          </div>
          <div className="modal-actions">
            <button className="ui-btn ui-btn--primary" onClick={() => setWithdrawing(false)} autoFocus>
              OK
            </button>
          </div>
        </Modal>
      )}
      {choosing && (
        <Modal title="Choose a division" onClose={() => setChoosing(false)} width={420}>
          <DivisionPicker d={d} onPick={enter} onCancel={() => setChoosing(false)} />
        </Modal>
      )}
    </>
  )
}

function DivisionPicker({ d, onPick, onCancel }: { d: EventDetailsData; onPick: (id: string) => void; onCancel: () => void }) {
  const divisions = d.divisions.filter((x) => x.name.trim())
  const [pick, setPick] = useState(divisions[0]?.id ?? '')
  return (
    <>
      <div className="modal-body form">
        {divisions.map((x) => (
          <label key={x.id} className="check ed-division-option">
            <input type="radio" name="division" checked={pick === x.id} onChange={() => setPick(x.id)} />
            <span>
              <strong>{x.name}</strong>
              {x.ratingRange && <span className="muted"> · {x.ratingRange}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onCancel}>Cancel</button>
        <button className="ui-btn ui-btn--primary" disabled={!pick} onClick={() => onPick(pick)}>
          Enter
        </button>
      </div>
    </>
  )
}

function SectionView({ s, d, roundAction }: { s: SectionDef; d: EventDetailsData; roundAction?: (round: number) => ReactNode }) {
  switch (s.kind) {
    case 'schedule':
      return (
        <table className="ed-table">
          <thead>
            <tr>
              <th>Round</th>
              <th>Date</th>
              <th>Time</th>
              {roundAction && <th aria-label="Byes" />}
            </tr>
          </thead>
          <tbody>
            {[...d.schedule]
              .filter((r) => r.date)
              .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
              .map((r, i) => (
                <tr key={r.id}>
                  <td>{r.round || '—'}</td>
                  <td>{format(toDate(r.date), 'EEE d MMM yyyy')}</td>
                  <td>{r.time ? fmtTime(r.time) : '—'}</td>
                  {roundAction && <td className="ed-round-action">{roundAction(i + 1)}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      )
    case 'pairingSettings':
      return (
        <div className="ed-lines">
          <span>
            Bye for the odd player: <strong>{d.pabValue === '0.5' ? '½ point' : d.pabValue === '0' ? '0 points' : '1 point'}</strong>
          </span>
          <span>
            Round 1 top seed plays: <strong>{d.topColour === 'black' ? 'Black' : d.topColour === 'white' ? 'White' : 'Random colour'}</strong>
          </span>
          <span>
            Seeded by: <strong>{d.seedBy === 'acf' ? 'ACF rating' : `${fideRatingFor(d).label} rating`}</strong>
          </span>
        </div>
      )
    case 'venue':
      return (
        <div className="ed-lines">
          <strong>{d.venue.name}</strong>
          {d.venue.room?.trim() && <span>{d.venue.room}</span>}
          <span>{d.venue.address}</span>
          {mapsUrl(d) && (
            <a href={mapsUrl(d)} target="_blank" rel="noreferrer">
              <Icon name="pinMap" size={14} /> Open in Google Maps
            </a>
          )}
          {d.venue.note && toPlain(d.venue.note).trim() && (
            <div className="ed-venue-note">
              <RichText text={d.venue.note} />
            </div>
          )}
        </div>
      )
    case 'contact':
      return (
        <div className="ed-lines">
          <strong>{d.contact.name}</strong>
          {d.contact.email && <a href={`mailto:${d.contact.email}`}>{d.contact.email}</a>}
          {d.contact.phone && <a href={`tel:${d.contact.phone.replace(/[^\d+]/g, '')}`}>{d.contact.phone}</a>}
        </div>
      )
    case 'fees':
      return (
        <>
        <table className="ed-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {d.fees
              .filter((f) => f.type.trim())
              .map((f) => (
                <tr key={f.id}>
                  <td>{f.type}</td>
                  <td>{/^\d/.test(f.amount.trim()) ? `$${f.amount.trim()}` : f.amount}</td>
                  <td>{f.note || '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
          {d.feesNote && toPlain(d.feesNote).trim() && (
            <div className="ed-venue-note">
              <RichText text={d.feesNote} />
            </div>
          )}
        </>
      )
    case 'divisions':
      return (
        <table className="ed-table">
          <thead>
            <tr>
              <th>Division</th>
              <th>Rating range</th>
            </tr>
          </thead>
          <tbody>
            {d.divisions
              .filter((x) => x.name.trim())
              .map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.ratingRange || 'Open'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )
    case 'datetime':
      return <p>{format(parseISO(d.entriesClose), 'EEEE d MMMM yyyy, h:mm a')}</p>
    default:
      return (
        <>
          {s.id === 'timeControl' && !!d.timeTypes?.length && (
            <div className="ed-time-types">
              {TIME_TYPES.filter((t) => d.timeTypes!.includes(t.id)).map((t) => (
                <span key={t.id} className="ev-badge">
                  {t.label}
                </span>
              ))}
            </div>
          )}
          {s.id === 'byeRules' && (
            <p className="ed-bye-setting">
              {d.halfPointByes ? 'Requested byes are worth ½ point (up to two per player).' : 'Requested byes are zero-point byes.'}
            </p>
          )}
          <RichText text={String(d[s.id])} />
        </>
      )
  }
}

/** "Byes" on each round row: entered players request a bye until that round is paired. Only the organiser can cancel it. */
function ByeButton({ event, round, setEvent }: { event: CalEvent; round: number; setEvent: (fn: (e: CalEvent) => CalEvent) => void }) {
  const { saved } = useBrand()
  const { confirm, toast } = useDialogs()
  const email = saved.profile?.email?.toLowerCase()
  const entry = email ? event.entries?.find((x) => x.email.toLowerCase() === email) : undefined
  if (!entry) return null
  const bye = byeFor(event, entry.id, round)
  if (bye) {
    const v = byeValues(event).get(bye.id)
    return <span className="ev-badge">{v === 0.5 ? '½-point bye' : 'Zero-point bye'}</span>
  }
  if (isReleased(event, round)) return <span className="muted small">Paired</span>
  const request = async () => {
    const draft = { id: uid('bye'), entryId: entry.id, round, by: 'player' as const, at: new Date().toISOString() }
    const half = byeValues(event, draft).get(draft.id) === 0.5
    const start = scheduledRounds(event).find((r) => r.round === round)?.label ?? `Round ${round}`
    const ok = await confirm({
      title: `Request a bye in ${start}?`,
      message: `${half ? 'This will be a half-point bye (½ point).' : 'This will be a zero-point bye (0 points).'} You won’t be paired in this round. Only the organiser can cancel a bye once it’s requested.`,
      confirmLabel: 'Request bye',
    })
    if (!ok) return
    setEvent((e) => ({ ...e, byes: [...(e.byes ?? []), draft] }))
    toast(`Bye requested for ${start}`)
  }
  return (
    <button className="ui-btn ui-btn--small" onClick={request}>
      Byes
    </button>
  )
}

/** Number of entries and names – grouped by division when the tournament has divisions. */
function EntriesList({ event, d, you }: { event: CalEvent; d: EventDetailsData; you: string }) {
  const entries = [...(event.entries ?? [])].sort((a, b) => a.at.localeCompare(b.at))
  const divisions = d.divisions.filter((x) => x.name.trim())
  const name = (e: EventEntry) => (
    <li key={e.id}>
      {e.name}
      {you && e.email.toLowerCase() === you.toLowerCase() && <span className="muted"> (you)</span>}
    </li>
  )
  if (!entries.length) return <p className="muted">No entries yet.</p>
  return (
    <div className="ed-entries">
      <p className="ed-count">
        <strong>{entries.length}</strong> {entries.length === 1 ? 'entry' : 'entries'}
      </p>
      {divisions.length ? (
        [...divisions, { id: '', name: 'No division', ratingRange: '' }].map((div) => {
          const list = entries.filter((e) => (div.id ? e.division === div.id : !divisions.some((x) => x.id === e.division)))
          if (!list.length && !div.id) return null
          return (
            <div key={div.id || 'none'} className="ed-entry-group">
              <h3>
                {div.name} <span className="muted">({list.length})</span>
              </h3>
              {list.length ? <ol>{list.map(name)}</ol> : <p className="muted small">No entries yet.</p>}
            </div>
          )
        })
      ) : (
        <ol>{entries.map(name)}</ol>
      )}
    </div>
  )
}

// ---------- Edit ----------

/** Full tournament details form. Save keeps whatever is filled in – it stays a Draft until every required section is done. */
function DetailsEditor({ event, onDone, save }: { event: CalEvent; onDone: () => void; save: (d: EventDetailsData) => void }) {
  const { setDetailsDirty } = useBrand()
  const { confirm, toast } = useDialogs()
  const original = detailsOf(event)
  const [d, setD] = useState<EventDetailsData>(() => structuredClone(original))
  const dirty = JSON.stringify(d) !== JSON.stringify(original)
  const missing = SECTIONS.filter((s) => s.required && !sectionFilled(d, s))

  useEffect(() => {
    setDetailsDirty(dirty)
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty, setDetailsDirty])
  useEffect(() => () => setDetailsDirty(false), [setDetailsDirty])

  const set = <K extends keyof EventDetailsData>(k: K, v: EventDetailsData[K]) => setD((x) => ({ ...x, [k]: v }))

  const done = () => {
    save(d)
    setDetailsDirty(false)
    toast(missing.length ? `Saved as draft – ${missing.length} required section${missing.length === 1 ? '' : 's'} still empty` : 'Tournament details saved')
    onDone()
  }
  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Discard your changes?', message: 'The details go back to how they were.', confirmLabel: 'Discard', danger: true }))) return
    setDetailsDirty(false)
    onDone()
  }

  return (
    <div className="ed-editor">
      <header className="page-head">
        <h1>Edit details</h1>
        <p>
          {event.name} · {dateRangeLabel(event)}. Required sections are marked <span className="ds-required">*</span>. You can save at any time – the tournament
          stays a draft until they’re all filled in.
        </p>
      </header>
      {SECTIONS.map((s) => (
        <section key={s.id} className="pf-section ed-edit-section">
          <h3>
            {s.label} {s.required && <span className="ds-required">*</span>}
            {s.required && !sectionFilled(d, s) && <span className="ev-badge ev-badge--draft">Missing</span>}
          </h3>
          {s.hint && <p className="muted small ed-hint">{s.hint}</p>}
          <SectionEditor s={s} d={d} set={set} />
        </section>
      ))}
      <div className="save-bar">
        <span className={missing.length ? 'save-status save-status--dirty' : 'save-status'}>
          {missing.length ? `Draft – ${missing.length} required section${missing.length === 1 ? '' : 's'} missing` : 'All required sections filled in'}
        </span>
        <button className="ui-btn" onClick={cancel}>Cancel</button>
        <button className="ui-btn ui-btn--primary" onClick={done}>Save</button>
      </div>
    </div>
  )
}

function SectionEditor({ s, d, set }: { s: SectionDef; d: EventDetailsData; set: <K extends keyof EventDetailsData>(k: K, v: EventDetailsData[K]) => void }) {
  const row = (label: string, control: ReactNode) => (
    <div className="pf-edit-row">
      <span className="ds-field-label">{label}</span>
      <div className="pf-control">{control}</div>
    </div>
  )
  switch (s.kind) {
    case 'schedule':
      return (
        <RowsEditor
          rows={d.schedule}
          onChange={(v) => set('schedule', v)}
          // A new round starts with the last round's date and time.
          blank={() => {
            const last = d.schedule[d.schedule.length - 1]
            return { id: uid('rd'), round: `Round ${d.schedule.length + 1}`, date: last?.date ?? '', time: last?.time ?? '' }
          }}
          addLabel="Add round"
          columns={[
            { key: 'round', label: 'Round', placeholder: 'E.g. Round 1' },
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'time', label: 'Time', type: 'time' },
          ]}
        />
      )
    case 'venue':
      return (
        <>
          {row('Venue name', <input className="ds-input" value={d.venue.name} placeholder="E.g. Town Hall" onChange={(e) => set('venue', { ...d.venue, name: e.target.value })} />)}
          {row('Room', <input className="ds-input" value={d.venue.room ?? ''} placeholder="Optional, e.g. Hall B" onChange={(e) => set('venue', { ...d.venue, room: e.target.value })} />)}
          {row('Address', <input className="ds-input" value={d.venue.address} placeholder="E.g. 483 George St, Sydney NSW 2000" onChange={(e) => set('venue', { ...d.venue, address: e.target.value })} />)}
          {row('Note', <RichTextEditor value={d.venue.note ?? ''} onChange={(note) => set('venue', { ...d.venue, note })} ariaLabel="Venue note" placeholder="Optional, e.g. parking, entrance, accessibility" minHeight={80} />)}
          {row('Map link', <input className="ds-input" value={d.venue.mapUrl} placeholder="Optional – built from the address if empty" onChange={(e) => set('venue', { ...d.venue, mapUrl: e.target.value })} />)}
        </>
      )
    case 'contact':
      return (
        <>
          {row('Name', <input className="ds-input" value={d.contact.name} placeholder="E.g. Tournament director" onChange={(e) => set('contact', { ...d.contact, name: e.target.value })} />)}
          {row('Email', <input className="ds-input" type="email" value={d.contact.email} onChange={(e) => set('contact', { ...d.contact, email: e.target.value })} />)}
          {row('Phone', <input className="ds-input" type="tel" value={d.contact.phone} onChange={(e) => set('contact', { ...d.contact, phone: e.target.value })} />)}
        </>
      )
    case 'fees':
      return (
        <RowsEditor
          rows={d.fees}
          onChange={(v) => set('fees', v)}
          blank={() => ({ id: uid('fee'), type: '', amount: '', note: '' })}
          addLabel="Add fee"
          columns={[
            { key: 'type', label: 'Type', placeholder: 'E.g. Adult, Junior, Member' },
            { key: 'amount', label: 'Amount (AUD)', placeholder: 'E.g. 60' },
            { key: 'note', label: 'Note', placeholder: 'Optional' },
          ]}
          after={
            <div className="pf-edit-row ed-fees-note">
              <span className="ds-field-label">Note</span>
              <div className="pf-control">
                <RichTextEditor value={d.feesNote ?? ''} onChange={(feesNote) => set('feesNote', feesNote)} ariaLabel="Entry fees note" placeholder="Optional, e.g. how to pay, refunds" minHeight={80} />
              </div>
            </div>
          }
        />
      )
    case 'divisions':
      return (
        <RowsEditor
          rows={d.divisions}
          onChange={(v) => set('divisions', v)}
          blank={() => ({ id: uid('div'), name: '', ratingRange: '' })}
          addLabel="Add division"
          columns={[
            { key: 'name', label: 'Division', placeholder: 'E.g. Open, Under 1600' },
            { key: 'ratingRange', label: 'Rating range', placeholder: 'Optional, e.g. Under 1600' },
          ]}
        />
      )
    case 'pairingSettings':
      return (
        <>
          {row(
            'Bye for the odd player',
            <select className="ds-input" value={d.pabValue ?? ''} onChange={(e) => set('pabValue', e.target.value as EventDetailsData['pabValue'])}>
              <option value="">Choose…</option>
              <option value="1">1 point</option>
              <option value="0.5">½ point</option>
              <option value="0">0 points</option>
            </select>,
          )}
          {row(
            'Round 1 top seed plays',
            <select className="ds-input" value={d.topColour ?? ''} onChange={(e) => set('topColour', e.target.value as EventDetailsData['topColour'])}>
              <option value="">Choose…</option>
              <option value="white">White</option>
              <option value="black">Black</option>
              <option value="random">Random</option>
            </select>,
          )}
          {row(
            'Seed by',
            <select className="ds-input" value={d.seedBy ?? ''} onChange={(e) => set('seedBy', e.target.value as EventDetailsData['seedBy'])}>
              <option value="">Choose…</option>
              <option value="fide">FIDE rating ({fideRatingFor(d).label.replace('FIDE ', '')}, from the time control)</option>
              <option value="acf">ACF rating</option>
            </select>,
          )}
        </>
      )
    case 'datetime':
      return <input className="ds-input ed-datetime" type="datetime-local" value={d.entriesClose} onChange={(e) => set('entriesClose', e.target.value)} />
    case 'url':
      return <input className="ds-input" type="url" value={d.registrationUrl} placeholder="https://…" onChange={(e) => set('registrationUrl', e.target.value)} />
    default:
      return (
        <>
          {s.id === 'timeControl' && (
            <div className="ed-time-ticks" role="group" aria-label="Time control type">
              {TIME_TYPES.map((t) => (
                <label key={t.id} className="check ed-bye-tick">
                  <input
                    type="checkbox"
                    checked={!!d.timeTypes?.includes(t.id)}
                    onChange={(e) => {
                      const on = new Set(d.timeTypes ?? [])
                      if (e.target.checked) on.add(t.id)
                      else on.delete(t.id)
                      set('timeTypes', TIME_TYPES.map((x) => x.id).filter((id) => on.has(id)))
                    }}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          )}
          {s.id === 'byeRules' && (
            <label className="check ed-bye-tick">
              <input type="checkbox" checked={!!d.halfPointByes} onChange={(e) => set('halfPointByes', e.target.checked)} />
              Requested byes are worth ½ point (up to two per player, requested before the previous round starts)
            </label>
          )}
          <RichTextEditor value={String(d[s.id])} onChange={(v) => set(s.id, v as never)} ariaLabel={s.label} placeholder="Type here…" />
        </>
      )
  }
}

interface Column<T> {
  key: keyof T & string
  label: string
  placeholder?: string
  type?: string
}

/** A small table of inputs with add / remove rows. */
function RowsEditor<T extends { id: string }>({
  rows, onChange, blank, columns, addLabel, after,
}: {
  rows: T[]
  onChange: (r: T[]) => void
  blank: () => T
  columns: Column<T>[]
  addLabel: string
  /** Extra fields under the table (e.g. a section note). */
  after?: ReactNode
}) {
  return (
    <div className="ed-rows">
      {rows.length > 0 && (
        <div className="ed-rows-head" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) 32px` }}>
          {columns.map((c) => (
            <span key={c.key}>{c.label}</span>
          ))}
          <span />
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.id} className="ed-rows-row" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) 32px` }}>
          {columns.map((c) => (
            <input
              key={c.key}
              className="ds-input"
              type={c.type ?? 'text'}
              aria-label={c.label}
              placeholder={c.placeholder}
              value={String(r[c.key] ?? '')}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.key]: e.target.value } : x)))}
            />
          ))}
          <button className="icon-btn icon-btn--danger" title="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      ))}
      <button className="ui-btn ui-btn--small" onClick={() => onChange([...rows, blank()])}>
        <Icon name="plus" size={14} /> {addLabel}
      </button>
      {after}
    </div>
  )
}
