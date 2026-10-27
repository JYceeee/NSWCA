import { format } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { detailsOf, isTournament } from '../data/eventDetails'
import { dateRangeLabel, fmtDate } from '../data/events'
import { isFinished } from '../events/pairings'
import { PairingTable } from '../events/PairingsSection'
import { useEventBook } from '../events/useEventBook'
import { uid } from '../store/BrandStore'
import type { CalEvent, PairingBoard, PairingRound } from '../types'
import {
  boardsFromPairs, buildTrf, byeFor, byeValues, generateBlock, halfByeBlock, isReleased, pabLetter, ratingOf, roundCount, roundOf, scheduledRounds, startNumbers,
  topColour, unpairedIn,
} from './engine'
import { gacruxPair } from './gacrux'

type Tab = 'byes' | 'generate' | 'results'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'byes', label: 'Byes', icon: 'calendar' },
  { id: 'generate', label: 'Generate pairing', icon: 'swap' },
  { id: 'results', label: 'Results', icon: 'check' },
]

/** Organiser tools: byes, generating rounds with Gacrux, entering results. */
export function PairingsPage() {
  const { book, commit } = useEventBook()
  const [tab, setTab] = useState<Tab>('byes')
  const today = fmtDate(new Date())
  const tournaments = useMemo(
    () =>
      book.events
        .filter((e) => isTournament(e, book.categories))
        // Upcoming / running first (soonest), then past (latest).
        .sort((a, b) => Number(a.endDate < today) - Number(b.endDate < today) || (a.endDate < today ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate))),
    [book, today],
  )
  const [id, setId] = useState(() => tournaments[0]?.id ?? '')
  const event = tournaments.find((e) => e.id === id) ?? tournaments[0]
  const setEvent = (fn: (e: CalEvent) => CalEvent) => commit((b) => ({ ...b, events: b.events.map((x) => (x.id === event?.id ? fn(x) : x)) }))

  return (
    <div className="brand-page pg-page">
      <header className="page-head">
        <h1>Pairings</h1>
        <p>Byes, pairing rounds with Gacrux (FIDE Dutch system) and entering results.</p>
      </header>
      <div className="brand-tabs pg-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="brand-tab" onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>
      {!tournaments.length ? (
        <p className="muted">There are no tournaments yet. Create one in Upcoming events with the Tournament category.</p>
      ) : (
        <>
          <label className="pg-picker">
            <span>Tournament</span>
            <select className="ui-input" value={event?.id} onChange={(e) => setId(e.target.value)}>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {dateRangeLabel(t)}
                </option>
              ))}
            </select>
            <span className="muted small">
              {(event?.entries ?? []).length} entered · {roundCount(event!)} rounds
            </span>
          </label>
          {event && tab === 'byes' && <ByesTab key={event.id} event={event} setEvent={setEvent} />}
          {event && tab === 'generate' && <GenerateTab key={event.id} event={event} setEvent={setEvent} />}
          {event && tab === 'results' && <ResultsTab key={event.id} event={event} setEvent={setEvent} />}
        </>
      )}
    </div>
  )
}

type TabProps = { event: CalEvent; setEvent: (fn: (e: CalEvent) => CalEvent) => void }

// ---------- Byes ----------

function ByesTab({ event, setEvent }: TabProps) {
  const { toast } = useDialogs()
  const d = detailsOf(event)
  const n = roundCount(event)
  const sno = event.startNumbers ?? {}
  const values = byeValues(event)
  const players = [...(event.entries ?? [])].sort((a, b) => (sno[a.id] ?? 1e9) - (sno[b.id] ?? 1e9) || ratingOf(event, b) - ratingOf(event, a) || a.name.localeCompare(b.name))
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

  const choose = (entryId: string, round: number, value: 0 | 0.5 | null) => {
    const bye = byeFor(event, entryId, round)
    const name = event.entries?.find((x) => x.id === entryId)?.name
    setOpen(null)
    if (value === null) {
      if (bye) setEvent((e) => ({ ...e, byes: (e.byes ?? []).filter((x) => x.id !== bye.id) }))
      toast(`${name}’s bye in round ${round} cancelled`)
      return
    }
    setEvent((e) => ({
      ...e,
      byes: bye
        ? (e.byes ?? []).map((x) => (x.id === bye.id ? { ...x, value } : x))
        : [...(e.byes ?? []), { id: uid('bye'), entryId, round, by: 'organiser', at: new Date().toISOString(), value }],
    }))
    toast(`${value === 0.5 ? 'Half-point' : 'Zero-point'} bye for ${name} in round ${round}`)
  }

  if (!players.length) return <p className="muted">No one has entered this tournament yet.</p>
  return (
    <div className="pg-panel">
      <p className="muted small pg-rule">
        {d.halfPointByes
          ? 'Half-point byes: up to two per player, when requested before the previous round starts or set here. Any other bye is a zero-point bye.'
          : 'Half-point byes are off (tick “Requested byes are worth ½ point” in the tournament’s Bye rules), so byes are zero-point byes.'}{' '}
        Point at a cell to choose a bye. Rounds already paired are locked.
      </p>
      <div className="pg-grid-wrap">
        <table className="pg-grid">
          <thead>
            <tr>
              <th>Player</th>
              {Array.from({ length: n }, (_, i) => i + 1).map((r) => (
                <th key={r} className="pg-c" title={isReleased(event, r) ? 'Paired – locked' : undefined}>
                  R{r} {isReleased(event, r) && <Icon name="check" size={12} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td className="pg-player">
                  {sno[p.id] && <span className="pr-sno pr-sno--white">{sno[p.id]}</span>}
                  <span>{p.name}</span>
                  <span className="muted small">{ratingOf(event, p) || 'unrated'}</span>
                </td>
                {Array.from({ length: n }, (_, i) => i + 1).map((r) => {
                  const bye = byeFor(event, p.id, r)
                  const locked = isReleased(event, r)
                  const v = bye ? values.get(bye.id) : undefined
                  const key = `${p.id}:${r}`
                  const halfBlock = halfByeBlock(event, p.id, r)
                  return (
                    <td key={r} className="pg-c">
                      <div className="pg-cell-wrap" onMouseEnter={() => !locked && show(key)} onMouseLeave={hide}>
                        <button
                          className={['pg-cell', bye && (v === 0.5 ? 'pg-cell--half' : 'pg-cell--zero')].filter(Boolean).join(' ')}
                          disabled={locked}
                          aria-haspopup="menu"
                          aria-expanded={open === key}
                          aria-label={`${p.name}, round ${r}${bye ? `: ${v === 0.5 ? 'half-point' : 'zero-point'} bye` : ''}`}
                          title={
                            bye
                              ? `${v === 0.5 ? 'Half-point' : 'Zero-point'} bye – ${bye.by === 'player' ? 'requested by the player' : 'set by the organiser'} ${format(new Date(bye.at), 'd MMM, h:mm a')}`
                              : locked
                                ? 'Paired – locked'
                                : undefined
                          }
                          onClick={() => (open === key ? setOpen(null) : show(key))}
                        >
                          {bye ? (
                            <>
                              {v === 0.5 ? '½' : '0'}
                              <small>{bye.by === 'player' ? 'P' : 'O'}</small>
                            </>
                          ) : (
                            ''
                          )}
                        </button>
                        {open === key && !locked && (
                          <div className="pg-pop" role="menu" aria-label={`Bye for ${p.name} in round ${r}`}>
                            <button role="menuitem" className={v === 0.5 ? 'pg-pop-item pg-pop-item--on' : 'pg-pop-item'} disabled={!!halfBlock} title={halfBlock ?? undefined} onClick={() => choose(p.id, r, 0.5)}>
                              <span>½</span> Half-point bye {v === 0.5 && <Icon name="check" size={13} />}
                            </button>
                            {halfBlock && <span className="pg-pop-note">{halfBlock}</span>}
                            <button role="menuitem" className={bye && v === 0 ? 'pg-pop-item pg-pop-item--on' : 'pg-pop-item'} onClick={() => choose(p.id, r, 0)}>
                              <span>0</span> Zero-point bye {bye && v === 0 && <Icon name="check" size={13} />}
                            </button>
                            {bye && (
                              <button role="menuitem" className="pg-pop-item pg-pop-item--danger" onClick={() => choose(p.id, r, null)}>
                                <Icon name="x" size={13} /> Cancel bye
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        <strong>½</strong> half-point bye · <strong>0</strong> zero-point bye · <strong>P</strong> requested by the player · <strong>O</strong> set by the organiser
      </p>
    </div>
  )
}

// ---------- Generate ----------

function GenerateTab({ event, setEvent }: TabProps) {
  const { confirm, toast } = useDialogs()
  const n = roundCount(event)
  const firstOpen = Array.from({ length: n }, (_, i) => i + 1).find((r) => !isReleased(event, r)) ?? n
  const [round, setRound] = useState(Math.max(1, firstOpen))
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ boards: PairingBoard[]; sno: Record<string, number>; rules: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setPreview(null)
    setError(null)
  }, [round])

  const existing = roundOf(event, round)
  const block = existing ? null : generateBlock(event, round)
  const schedule = scheduledRounds(event).find((r) => r.round === round)

  const generate = async () => {
    setError(null)
    setPreview(null)
    const sno = startNumbers(event)
    try {
      const res = await gacruxPair(
        { trf: buildTrf(event, round, sno), round, top: round === 1 ? topColour(event) : null, unpaired: unpairedIn(event, round, sno), pab: pabLetter(event) },
        setBusy,
      )
      setPreview({ boards: boardsFromPairs(event, round, res.pairs, sno), sno, rules: res.rules })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed')
    } finally {
      setBusy(null)
    }
  }

  const title = `Pairing of round ${round}${schedule?.start ? `, at ${format(schedule.start, 'HHmm')} of ${format(schedule.start, 'dd/MM/yyyy')}` : ''}`

  const publish = () => {
    if (!preview) return
    const r: PairingRound = { round, title, fileName: `Generated with Gacrux (FIDE Dutch, rules ${preview.rules})`, at: new Date().toISOString(), boards: preview.boards, generated: true }
    setEvent((e) => ({ ...e, startNumbers: { ...preview.sno, ...(e.startNumbers ?? {}) }, pairings: [...(e.pairings ?? []).filter((x) => x.round !== round), r] }))
    setPreview(null)
    toast(`Round ${round} published to the tournament’s Pairings`)
  }

  const unpublish = async () => {
    if (!existing) return
    if (!(await confirm({ title: `Unpublish round ${round}?`, message: 'The pairing is removed from the tournament so you can generate it again.', confirmLabel: 'Unpublish', danger: true }))) return
    setEvent((e) => ({ ...e, pairings: (e.pairings ?? []).filter((x) => x.round !== round) }))
  }

  const downloadTrf = () => {
    if (!preview) return
    const withRound: PairingRound = { round, title, fileName: '', at: '', boards: preview.boards, generated: true }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buildTrf({ ...event, startNumbers: preview.sno }, round, preview.sno, withRound)], { type: 'text/plain' }))
    a.download = `${event.name.replace(/[^\w-]+/g, '-')}-round-${round}.trf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const played = existing ? existing.boards.some((b) => b.black && b.result.trim()) : false

  return (
    <div className="pg-panel">
      <div className="pg-row">
        <label className="pg-picker">
          <span>Round</span>
          <select className="ui-input" value={round} onChange={(e) => setRound(Number(e.target.value))}>
            {Array.from({ length: n }, (_, i) => i + 1).map((r) => {
              const why = isReleased(event, r) ? 'published' : generateBlock(event, r) ? 'not ready' : 'ready'
              return (
                <option key={r} value={r}>
                  Round {r} – {why}
                </option>
              )
            })}
          </select>
        </label>
        {!existing && !block && (
          <button className="ui-btn ui-btn--primary" disabled={!!busy} onClick={generate}>
            <Icon name="swap" size={15} /> {preview ? 'Regenerate' : 'Generate'}
          </button>
        )}
      </div>

      {existing ? (
        <div className="pg-note">
          Round {round} is published{existing.generated ? '' : ' (uploaded from a file)'}.{' '}
          {existing.generated && !played ? (
            <button className="ui-btn ui-btn--small ui-btn--danger" onClick={unpublish}>
              Unpublish to redo it
            </button>
          ) : (
            <span className="muted">{played ? 'Results have been entered, so it can’t be redone.' : ''}</span>
          )}
        </div>
      ) : block ? (
        <div className="pg-note pg-note--warn">{block}</div>
      ) : (
        <p className="muted small">
          Pairs the entered players with Gacrux using the FIDE (Dutch) System, skipping players with a bye this round
          {unpairedIn(event, round, startNumbers(event)).length ? ` (${unpairedIn(event, round, startNumbers(event)).length})` : ''}. The first run downloads the engine
          (about 10 MB).
        </p>
      )}
      {busy && <p className="pg-busy">{busy}</p>}
      {error && <p className="form-error">{error}</p>}

      {preview && (
        <div className="pg-preview">
          <div className="pr-head">
            <h3>{title}</h3>
            <span className="muted small">Preview – not published yet</span>
          </div>
          <PairingTable boards={preview.boards} isYou={() => false} />
          <div className="pg-actions">
            <button className="ui-btn" onClick={downloadTrf}>
              <Icon name="download" size={15} /> Download TRF
            </button>
            <button className="ui-btn" disabled={!!busy} onClick={generate}>
              Regenerate
            </button>
            <button className="ui-btn ui-btn--primary" onClick={publish}>
              Publish to Pairings
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Results ----------

const RESULTS = ['1 - 0', '½ - ½', '0 - 1', '+ - -', '- - +']

function ResultsTab({ event, setEvent }: TabProps) {
  const { toast } = useDialogs()
  const rounds = [...(event.pairings ?? [])].sort((a, b) => a.round - b.round)
  const firstOpen = rounds.find((r) => !isFinished(r)) ?? rounds[rounds.length - 1]
  const [round, setRound] = useState(firstOpen?.round ?? 0)
  const current = rounds.find((r) => r.round === round)
  const [draft, setDraft] = useState<Record<number, string>>({})
  useEffect(() => setDraft(Object.fromEntries((current?.boards ?? []).map((b) => [b.board, b.result]))), [current])

  if (!rounds.length) return <p className="muted">No rounds yet – publish one in Generate pairing (or upload one on the tournament page).</p>

  const changed = current?.boards.some((b) => (draft[b.board] ?? '') !== b.result)
  const save = () => {
    if (!current) return
    const next = { ...current, boards: current.boards.map((b) => (b.black ? { ...b, result: draft[b.board] ?? '' } : b)) }
    setEvent((e) => ({ ...e, pairings: (e.pairings ?? []).map((r) => (r.round === round ? next : r)) }))
    toast(isFinished(next) ? `Round ${round} complete – it now shows under Results` : `Round ${round} results saved`)
  }

  return (
    <div className="pg-panel">
      <div className="pg-row">
        <label className="pg-picker">
          <span>Round</span>
          <select className="ui-input" value={round} onChange={(e) => setRound(Number(e.target.value))}>
            {rounds.map((r) => (
              <option key={r.round} value={r.round}>
                Round {r.round} – {isFinished(r) ? 'complete' : 'results needed'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {current && (
        <>
          <table className="pg-results">
            <thead>
              <tr>
                <th>Bo.</th>
                <th>White</th>
                <th className="pg-c">Result</th>
                <th>Black</th>
              </tr>
            </thead>
            <tbody>
              {current.boards.map((b) => (
                <tr key={b.board}>
                  <td>{b.board}</td>
                  <td>
                    {b.white.sno && <span className="pr-sno pr-sno--white">{b.white.sno}</span>} {b.white.name}
                  </td>
                  <td className="pg-c">
                    {b.black ? (
                      <select className="ui-input pg-result" value={draft[b.board] ?? ''} onChange={(e) => setDraft({ ...draft, [b.board]: e.target.value })} aria-label={`Board ${b.board} result`}>
                        <option value="">–</option>
                        {RESULTS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong>{b.result}</strong>
                    )}
                  </td>
                  <td>
                    {b.black ? (
                      <>
                        {b.black.sno && <span className="pr-sno pr-sno--black">{b.black.sno}</span>} {b.black.name}
                      </>
                    ) : (
                      <span className="muted">{b.byeKind === 'half' ? 'half-point bye' : b.byeKind === 'zero' ? 'zero-point bye' : 'bye'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">+ - - and - - + are forfeits (the + side wins without playing).</p>
          <div className="pg-actions">
            <button className="ui-btn ui-btn--primary" disabled={!changed} onClick={save}>
              Save results
            </button>
          </div>
        </>
      )}
    </div>
  )
}
