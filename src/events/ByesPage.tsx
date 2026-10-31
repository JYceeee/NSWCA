import { format } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { detailsOf, fideRatingFor, isTournament } from '../data/eventDetails'
import { dateRangeLabel, fmtDate } from '../data/events'
import { PageHead } from '../site/PageHead'
import { uid, useSession } from '../store/BrandStore'
import type { CalEvent, EventEntry } from '../types'
import { byeFor, byeValues, halfByeBlock, isReleased, roundCount } from './byes'
import { useEventBook } from './useEventBook'

/** Every player's byes, one row each, once a tournament is chosen. */
export function ByesPage() {
  const { book } = useEventBook()
  const today = fmtDate(new Date())
  const tournaments = useMemo(
    () =>
      book.events
        .filter((e) => isTournament(e, book.categories))
        // Upcoming / running first (soonest), then past (latest).
        .sort((a, b) => Number(a.endDate < today) - Number(b.endDate < today) || (a.endDate < today ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate))),
    [book, today],
  )
  const [id, setId] = useState('')
  const event = tournaments.find((e) => e.id === id)

  return (
    <div className="brand-page by-page">
      <PageHead page="byes" title="Byes">
        See every player’s byes in a tournament.
      </PageHead>
      {tournaments.length ? (
        <>
          <label className="pg-picker">
            <span>Tournament</span>
            <select className="ui-input" value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Choose a tournament</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {dateRangeLabel(t)}
                </option>
              ))}
            </select>
          </label>
          {event && <ByesTable key={event.id} event={event} />}
        </>
      ) : (
        <p className="muted">There are no tournaments yet.</p>
      )}
    </div>
  )
}

/** null = by time of bye requested. */
type NameSort = 'asc' | 'desc' | null

function ByesTable({ event }: { event: CalEvent }) {
  const { commit } = useEventBook()
  const { can } = useSession()
  const { toast } = useDialogs()
  const manage = can('byes.manage', event)
  const [sort, setSort] = useState<NameSort>(null)
  /** The cell whose choice window is open ("entryId:round"). */
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<number>()
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (key: string) => {
    clearTimeout(timer.current)
    setOpen(key)
  }
  const hide = () => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(null), 160)
  }

  const rounds = Array.from({ length: roundCount(event) }, (_, i) => i + 1)
  const values = byeValues(event)
  const byes = event.byes ?? []
  const byesOf = (x: EventEntry) => byes.filter((b) => b.entryId === x.id)
  const firstAsked = (x: EventEntry) => byesOf(x).map((b) => b.at).sort()[0]
  /** Every bye of the player handled; a new one has no mark, so the row goes back to Undone. */
  const isUpdated = (x: EventEntry) => byesOf(x).length > 0 && byesOf(x).every((b) => b.done)
  const key = fideRatingFor(detailsOf(event)).key
  const rating = (x: EventEntry) => x[key] || x.acfRating || 'unrated'

  const players = [...(event.entries ?? [])].sort((a, b) => {
    if (sort) return (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name)
    // Oldest request first; players with no byes after them.
    const [x, y] = [firstAsked(a), firstAsked(b)]
    return x && y ? x.localeCompare(y) : x ? -1 : y ? 1 : a.name.localeCompare(b.name)
  })

  const setEvent = (fn: (e: CalEvent) => CalEvent) => commit((b) => ({ ...b, events: b.events.map((x) => (x.id === event.id ? fn(x) : x)) }))

  const choose = (x: EventEntry, round: number, value: 0 | 0.5 | null) => {
    const bye = byeFor(event, x.id, round)
    setOpen(null)
    if (value === null) {
      if (bye) setEvent((e) => ({ ...e, byes: (e.byes ?? []).filter((b) => b.id !== bye.id) }))
      return toast(`${x.name}’s bye in round ${round} cancelled`)
    }
    setEvent((e) => ({
      ...e,
      byes: bye
        ? (e.byes ?? []).map((b) => (b.id === bye.id ? { ...b, value } : b))
        : // Set here, so it doesn't reopen the row the way a player's request does.
          [...(e.byes ?? []), { id: uid('bye'), entryId: x.id, round, by: 'organiser', at: new Date().toISOString(), value, done: isUpdated(x) }],
    }))
    toast(`${value === 0.5 ? 'Half-point' : 'Zero-point'} bye for ${x.name} in round ${round}`)
  }

  const setStatus = (x: EventEntry, done: boolean) => setEvent((e) => ({ ...e, byes: (e.byes ?? []).map((b) => (b.entryId === x.id ? { ...b, done } : b)) }))

  if (!players.length) return <p className="muted">No one has entered this tournament yet.</p>
  return (
    <div className="pg-panel">
      <div className="pg-grid-wrap">
        <table className="pg-grid by-grid">
          <thead>
            <tr>
              <th aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : 'none'}>
                <button className="by-sort" title="Sort by name" onClick={() => setSort(sort === null ? 'asc' : sort === 'asc' ? 'desc' : null)}>
                  Name
                  {sort && (
                    <span className={sort === 'asc' ? 'by-sort-up' : undefined}>
                      <Icon name="chevronDown" size={13} />
                    </span>
                  )}
                </button>
              </th>
              {rounds.map((r) => (
                <th key={r} className="pg-c" title={isReleased(event, r) ? 'Paired – locked' : undefined}>
                  R{r} {isReleased(event, r) && <Icon name="check" size={12} />}
                </th>
              ))}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const updated = isUpdated(p)
              return (
                <tr key={p.id} className={updated ? 'by-row--updated' : undefined}>
                  <td>
                    <div className="pg-player">
                      <span>{p.name}</span>
                      <span className="muted small">{rating(p)}</span>
                    </div>
                  </td>
                  {rounds.map((r) => {
                    const bye = byeFor(event, p.id, r)
                    const locked = !manage || isReleased(event, r)
                    const v = bye ? values.get(bye.id) : undefined
                    const cell = `${p.id}:${r}`
                    const halfBlock = halfByeBlock(event, p.id, r)
                    return (
                      <td key={r} className="pg-c">
                        <div className="pg-cell-wrap" onMouseEnter={() => !locked && show(cell)} onMouseLeave={hide}>
                          <button
                            className={['pg-cell', bye && (v === 0.5 ? 'pg-cell--half' : 'pg-cell--zero')].filter(Boolean).join(' ')}
                            disabled={locked}
                            aria-haspopup={manage ? 'menu' : undefined}
                            aria-expanded={manage ? open === cell : undefined}
                            aria-label={`${p.name}, round ${r}${bye ? `: ${v === 0.5 ? 'half-point' : 'zero-point'} bye` : ''}`}
                            title={bye ? `${v === 0.5 ? 'Half-point' : 'Zero-point'} bye – ${bye.by === 'player' ? 'requested by the player' : 'set by the organiser'} ${format(new Date(bye.at), 'd MMM, h:mm a')}` : undefined}
                            onClick={() => (open === cell ? setOpen(null) : show(cell))}
                          >
                            {bye && (
                              <>
                                {v === 0.5 ? '½' : '0'}
                                <small>{bye.by === 'player' ? 'P' : 'O'}</small>
                              </>
                            )}
                          </button>
                          {open === cell && !locked && (
                            <div className="pg-pop" role="menu" aria-label={`Bye for ${p.name} in round ${r}`}>
                              <button role="menuitem" className={v === 0.5 ? 'pg-pop-item pg-pop-item--on' : 'pg-pop-item'} disabled={!!halfBlock} title={halfBlock ?? undefined} onClick={() => choose(p, r, 0.5)}>
                                <span>½</span> Half-point bye {v === 0.5 && <Icon name="check" size={13} />}
                              </button>
                              {halfBlock && <span className="pg-pop-note">{halfBlock}</span>}
                              <button role="menuitem" className={bye && v === 0 ? 'pg-pop-item pg-pop-item--on' : 'pg-pop-item'} onClick={() => choose(p, r, 0)}>
                                <span>0</span> Zero-point bye {bye && v === 0 && <Icon name="check" size={13} />}
                              </button>
                              {bye && (
                                <button role="menuitem" className="pg-pop-item pg-pop-item--danger" onClick={() => choose(p, r, null)}>
                                  <Icon name="x" size={13} /> Cancel bye
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td className="by-status">
                    {!byesOf(p).length ? (
                      <span className="muted">—</span>
                    ) : manage ? (
                      <select className="ui-input" aria-label={`Status for ${p.name}`} value={updated ? 'updated' : 'undone'} onChange={(e) => setStatus(p, e.target.value === 'updated')}>
                        <option value="undone">Undone</option>
                        <option value="updated">Updated</option>
                      </select>
                    ) : updated ? (
                      'Updated'
                    ) : (
                      'Undone'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        <strong>½</strong> half-point bye · <strong>0</strong> zero-point bye · <strong>P</strong> requested by the player · <strong>O</strong> set by the organiser
      </p>
    </div>
  )
}
