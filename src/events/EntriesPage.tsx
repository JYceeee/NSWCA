import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { detailsOf } from '../data/eventDetails'
import { dateRangeLabel } from '../data/events'
import { useBrand } from '../store/BrandStore'
import type { CalEvent, EventEntry } from '../types'
import { TITLES } from './pairings'
import { checkPlayer, exportPlayers, isOrganiserAdded, isSamePlayer, SOURCE_LABEL, sourceOf } from './players'
import { AddPlayerDialog, ImportPlayersDialog } from './PlayersDialogs'
import { playerFromEntry } from './playerList'
import { useProfileSync } from '../admin/AllPlayersPage'
import { useEventBook } from './useEventBook'

type SortKey = 'name' | 'fed' | 'dob' | 'gender' | 'title' | 'fideId' | 'kFide' | 'fideStandard' | 'fideRapid' | 'fideBlitz' | 'acfId' | 'acfRating' | 'division' | 'email' | 'at' | 'source'

const COLS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'fed', label: 'Fed' },
  { key: 'dob', label: 'DOB' },
  { key: 'gender', label: 'Gender' },
  { key: 'title', label: 'Title' },
  { key: 'fideId', label: 'FIDE ID' },
  { key: 'kFide', label: 'K FIDE' },
  { key: 'fideStandard', label: 'FIDE Standard' },
  { key: 'fideRapid', label: 'FIDE Rapid' },
  { key: 'fideBlitz', label: 'FIDE Blitz' },
  { key: 'acfId', label: 'ACF ID' },
  { key: 'acfRating', label: 'ACF rating' },
  { key: 'division', label: 'Division' },
  { key: 'email', label: 'Email' },
  { key: 'at', label: 'Entered on' },
  { key: 'source', label: 'Source' },
]

/** Check one edited player like an imported one: returns the tidied entry or a reason. */
function validateRow(x: EventEntry): { entry?: EventEntry; reason?: string } {
  const { entry, reason } = checkPlayer({
    Name: x.name, Federation: x.fed ?? '', DOB: x.dob ?? '', Gender: x.gender ?? '', Title: x.title ?? '',
    'FIDE ID': x.fideId, 'K FIDE': x.kFide ?? '', 'FIDE Standard': x.fideStandard ?? '', 'FIDE Rapid': x.fideRapid ?? '', 'FIDE Blitz': x.fideBlitz ?? '', 'ACF ID': x.acfId, Email: x.email,
  })
  if (!entry) return { reason }
  const acfRating = (x.acfRating ?? '').trim()
  if (acfRating && !/^\d{1,4}$/.test(acfRating)) return { reason: `ACF rating should be a number, not “${acfRating}”` }
  return { entry: { ...x, ...entry, division: x.division, acfRating } }
}

/** #events/<id>/entries – every entry of a tournament; players the organiser added can be edited. */
export function EntriesPage({ id }: { id: string }) {
  const { book, commit } = useEventBook()
  const syncProfile = useProfileSync()
  const { navigate, setEntriesGuard } = useBrand()
  const { confirm, toast } = useDialogs()
  const event = book.events.find((e) => e.id === id)
  const entries = useMemo(() => event?.entries ?? [], [event])
  const [draft, setDraft] = useState<EventEntry[]>(() => structuredClone(entries))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 })
  const [dialog, setDialog] = useState<'add' | 'import' | null>(null)
  /** Ticked rows (entry ids). */
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  // Players added, imported or removed elsewhere: bring them in without losing edits.
  useEffect(() => {
    setDraft((d) => {
      const ids = new Set(entries.map((x) => x.id))
      const link = new Map(entries.map((x) => [x.id, x.playerId]))
      const kept = d.filter((x) => ids.has(x.id)).map((x) => (x.playerId || !link.get(x.id) ? x : { ...x, playerId: link.get(x.id) }))
      const have = new Set(kept.map((x) => x.id))
      return [...kept, ...entries.filter((x) => !have.has(x.id)).map((x) => structuredClone(x))]
    })
  }, [entries])

  const byId = useMemo(() => new Map(entries.map((x) => [x.id, x])), [entries])
  useEffect(() => setTicked((t) => new Set([...t].filter((id) => byId.has(id)))), [byId])
  const changed = draft.filter((x) => JSON.stringify(x) !== JSON.stringify(byId.get(x.id)))
  const dirty = changed.length > 0

  const setEvent = (fn: (e: CalEvent) => CalEvent) => commit((b) => ({ ...b, events: b.events.map((x) => (x.id === id ? fn(x) : x)) }))

  /** Runs the checks and saves; false (with problems shown) if anything needs fixing. */
  const save = (): boolean => {
    const errs: Record<string, string> = {}
    const tidy = new Map<string, EventEntry>()
    for (const x of changed) {
      if (!isOrganiserAdded(x)) {
        tidy.set(x.id, x)
        continue
      }
      const { entry, reason } = validateRow(x)
      if (!entry) errs[x.id] = reason ?? 'Check this player'
      else tidy.set(x.id, entry)
    }
    // Duplicates are reported on the rows that can be edited.
    for (const x of changed.filter(isOrganiserAdded)) {
      const dup = draft.find((y) => y.id !== x.id && isSamePlayer(y, tidy.get(x.id) ?? x))
      if (dup && !errs[x.id]) errs[x.id] = `Same player as “${dup.name}”`
    }
    setErrors(errs)
    if (Object.keys(errs).length) {
      toast(`${Object.keys(errs).length} player${Object.keys(errs).length === 1 ? '' : 's'} need fixing before saving`)
      return false
    }
    // Details changed here also update the player in All players, and their profile if they have an account.
    const edited = new Map([...tidy.values()].filter((x) => isOrganiserAdded(x) && x.playerId).map((x) => [x.playerId!, x]))
    for (const p of book.players ?? []) if (edited.has(p.id)) syncProfile(p, { ...playerFromEntry(edited.get(p.id)!, p.id), added: p.added })
    commit((b) => ({
      ...b,
      events: b.events.map((e) => (e.id === id ? { ...e, entries: (e.entries ?? []).map((x) => tidy.get(x.id) ?? x) } : e)),
      players: (b.players ?? []).map((p) => (edited.has(p.id) ? { ...playerFromEntry(edited.get(p.id)!, p.id), added: p.added } : p)),
    }))
    setDraft((d) => d.map((x) => tidy.get(x.id) ?? x))
    toast('Entries saved')
    return true
  }

  // Leaving with unsaved edits asks Save / Discard / Stay.
  useEffect(() => {
    setEntriesGuard(dirty ? save : null)
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  })
  useEffect(() => () => setEntriesGuard(null), [setEntriesGuard])

  if (!event)
    return (
      <div className="brand-page">
        <p className="muted">This event no longer exists.</p>
      </div>
    )

  const d = detailsOf(event)
  const divisions = d.divisions.filter((x) => x.name.trim())
  const divisionName = (dv: string) => divisions.find((x) => x.id === dv)?.name ?? ''
  const back = () => navigate({ page: 'events', eventId: id, eventEdit: false, eventEntries: false })

  const patch = (rowId: string, p: Partial<EventEntry>) => {
    setDraft((rows) => rows.map((x) => (x.id === rowId ? { ...x, ...p } : x)))
    setErrors((e) => {
      const n = { ...e }
      delete n[rowId]
      return n
    })
  }

  const remove = async (x: EventEntry) => {
    if (!(await confirm({ title: `Remove ${x.name}?`, message: `${x.name} is withdrawn from ${event.name}. You can undo straight after.`, confirmLabel: 'Remove', danger: true }))) return
    const byes = (event.byes ?? []).filter((b) => b.entryId === x.id)
    setEvent((e) => ({ ...e, entries: (e.entries ?? []).filter((y) => y.id !== x.id), byes: (e.byes ?? []).filter((b) => b.entryId !== x.id) }))
    toast(`${x.name} removed`, { label: 'Undo', run: () => setEvent((e) => ({ ...e, entries: [...(e.entries ?? []), x], byes: [...(e.byes ?? []), ...byes] })) })
  }

  const removeTicked = async () => {
    const list = entries.filter((x) => ticked.has(x.id))
    if (!list.length) return
    const ok = await confirm({
      title: `Remove ${list.length} player${list.length === 1 ? '' : 's'}?`,
      message: `${list.map((x) => x.name).join(', ')} ${list.length === 1 ? 'is' : 'are'} withdrawn from ${event.name}. You can undo straight after.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    const ids = new Set(list.map((x) => x.id))
    const byes = (event.byes ?? []).filter((b) => ids.has(b.entryId))
    setEvent((e) => ({ ...e, entries: (e.entries ?? []).filter((y) => !ids.has(y.id)), byes: (e.byes ?? []).filter((b) => !ids.has(b.entryId)) }))
    setTicked(new Set())
    toast(`${list.length} player${list.length === 1 ? '' : 's'} removed`, { label: 'Undo', run: () => setEvent((e) => ({ ...e, entries: [...(e.entries ?? []), ...list], byes: [...(e.byes ?? []), ...byes] })) })
  }

  const value = (x: EventEntry, k: SortKey): string =>
    k === 'division' ? divisionName(x.division) : k === 'source' ? SOURCE_LABEL[sourceOf(x)] : String((x as unknown as Record<string, unknown>)[k] ?? '')
  const q = query.trim().toLowerCase()
  const rows = draft
    .filter((x) => !q || [x.name, x.fideId, x.acfId].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => {
      const [va, vb] = [value(a, sort.key), value(b, sort.key)]
      const num = ['fideStandard', 'fideRapid', 'fideBlitz', 'kFide', 'fideId', 'acfId', 'acfRating'].includes(sort.key)
      return (num ? (Number(va) || 0) - (Number(vb) || 0) : va.localeCompare(vb)) * sort.dir
    })

  const exportRows = (list: EventEntry[], suffix: string) =>
    exportPlayers(list, divisionName, `${event.name.replace(/[^\w-]+/g, '-')}-${suffix}.xlsx`).catch(() => toast('Could not create the Excel file'))
  const exportAll = () => exportRows(draft, 'entries')
  const shownTicked = rows.filter((x) => ticked.has(x.id))
  const allShownTicked = rows.length > 0 && shownTicked.length === rows.length
  const toggle = (rowId: string) =>
    setTicked((t) => {
      const n = new Set(t)
      if (n.has(rowId)) n.delete(rowId)
      else n.add(rowId)
      return n
    })

  return (
    <div className="brand-page ae-page">
      <button className="ui-btn ui-btn--small ed-back" onClick={back}>
        <Icon name="chevronLeft" size={14} /> Back to tournament
      </button>
      <header className="page-head">
        <h1>All entries</h1>
        <p>
          {event.name} · {dateRangeLabel(event)} · {draft.length} {draft.length === 1 ? 'entry' : 'entries'}
        </p>
      </header>

      <div className="ae-toolbar">
        <div className="cal-search">
          <Icon name="search" size={15} />
          <input className="ui-input" placeholder="Search name, FIDE ID or ACF ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {ticked.size > 0 && (
          <div className="ae-selection">
            <strong>{ticked.size} selected</strong>
            <button className="ui-btn ui-btn--small" onClick={() => exportRows(draft.filter((x) => ticked.has(x.id)), 'selected')}>
              <Icon name="download" size={14} /> Export selected
            </button>
            <button className="ui-btn ui-btn--small ui-btn--danger" onClick={removeTicked}>
              <Icon name="trash" size={14} /> Remove selected
            </button>
            <button className="ui-btn ui-btn--small" onClick={() => setTicked(new Set())}>
              Clear
            </button>
          </div>
        )}
        <span className="ae-toolbar-gap" />
        <button className="ui-btn" onClick={() => setDialog('add')}>
          <Icon name="plus" size={15} /> Add
        </button>
        <button className="ui-btn" onClick={() => setDialog('import')}>
          <Icon name="upload" size={15} /> Import
        </button>
        <button className="ui-btn" disabled={!draft.length} onClick={exportAll}>
          <Icon name="download" size={15} /> Export to Excel
        </button>
      </div>

      <div className="ae-wrap">
        <table className="ae-table">
          <thead>
            <tr>
              <th className="ae-tick">
                <input
                  type="checkbox"
                  aria-label="Tick all shown players"
                  checked={allShownTicked}
                  ref={(el) => {
                    if (el) el.indeterminate = shownTicked.length > 0 && !allShownTicked
                  }}
                  onChange={() =>
                    setTicked((t) => {
                      const n = new Set(t)
                      for (const x of rows) allShownTicked ? n.delete(x.id) : n.add(x.id)
                      return n
                    })
                  }
                />
              </th>
              {COLS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  <button className="ae-sort" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((-s.dir) as 1 | -1) : 1 }))}>
                    {c.label}
                    {sort.key === c.key && <Icon name={sort.dir === 1 ? 'chevronDown' : 'chevron'} size={12} />}
                  </button>
                </th>
              ))}
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const editable = isOrganiserAdded(x)
              const text = (k: 'name' | 'fed' | 'fideId' | 'fideStandard' | 'fideRapid' | 'fideBlitz' | 'acfId' | 'acfRating', width: string) =>
                editable ? (
                  <input className="ae-input" style={{ width }} value={(x[k] as string) ?? ''} aria-label={k} onChange={(e) => patch(x.id, { [k]: e.target.value })} />
                ) : (
                  (x[k] as string) || <span className="muted">—</span>
                )
              const pick = (k: 'gender' | 'title' | 'kFide', options: string[]) =>
                editable ? (
                  <select className="ae-input" value={(x[k] as string) ?? ''} aria-label={k} onChange={(e) => patch(x.id, { [k]: e.target.value })}>
                    <option value="">—</option>
                    {options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  (x[k] as string) || <span className="muted">—</span>
                )
              const isChanged = JSON.stringify(x) !== JSON.stringify(byId.get(x.id))
              return (
                <tr key={x.id} className={[errors[x.id] && 'ae-row--error', isChanged && 'ae-row--changed', ticked.has(x.id) && 'ae-row--ticked'].filter(Boolean).join(' ')}>
                  <td className="ae-tick">
                    <input type="checkbox" aria-label={`Tick ${x.name}`} checked={ticked.has(x.id)} onChange={() => toggle(x.id)} />
                  </td>
                  <td className="ae-name">
                    {text('name', '190px')}
                    {errors[x.id] && <div className="ds-field-error">{errors[x.id]}</div>}
                  </td>
                  <td>{text('fed', '56px')}</td>
                  <td>
                    {editable ? (
                      <input className="ae-input" type="date" value={x.dob ?? ''} aria-label="DOB" onChange={(e) => patch(x.id, { dob: e.target.value })} />
                    ) : x.dob ? (
                      format(new Date(`${x.dob}T00:00`), 'dd/MM/yyyy')
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{pick('gender', ['M', 'F'])}</td>
                  <td>{pick('title', TITLES.slice(0, 8))}</td>
                  <td>{text('fideId', '96px')}</td>
                  <td>{pick('kFide', ['10', '20', '40'])}</td>
                  <td>{text('fideStandard', '64px')}</td>
                  <td>{text('fideRapid', '64px')}</td>
                  <td>{text('fideBlitz', '64px')}</td>
                  <td>{text('acfId', '90px')}</td>
                  <td>{text('acfRating', '64px')}</td>
                  <td>
                    {divisions.length ? (
                      <select className="ae-input" value={x.division} aria-label="Division" onChange={(e) => patch(x.id, { division: e.target.value })}>
                        <option value="">—</option>
                        {divisions.map((dv) => (
                          <option key={dv.id} value={dv.id}>
                            {dv.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="ae-email">
                    {editable ? (
                      <input className="ae-input" style={{ width: '190px' }} type="email" value={x.email} aria-label="email" onChange={(e) => patch(x.id, { email: e.target.value })} />
                    ) : (
                      x.email || <span className="muted">—</span>
                    )}
                  </td>
                  <td className="ae-at">{format(new Date(x.at), 'd MMM yyyy, h:mm a')}</td>
                  <td>
                    <span className={`ae-source ae-source--${sourceOf(x)}`}>{SOURCE_LABEL[sourceOf(x)]}</span>
                  </td>
                  <td>
                    <button className="icon-btn icon-btn--danger" title="Remove player" onClick={() => remove(x)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr>
                <td colSpan={COLS.length + 2} className="muted ae-empty">
                  {draft.length ? 'No players match the search.' : 'No entries yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="save-bar">
        <span className={dirty ? 'save-status save-status--dirty' : 'save-status'}>
          {dirty ? `${changed.length} player${changed.length === 1 ? '' : 's'} changed – unsaved` : 'All changes saved'}
        </span>
        <button
          className="ui-btn"
          disabled={!dirty}
          onClick={() => {
            setDraft(structuredClone(entries))
            setErrors({})
          }}
        >
          Discard changes
        </button>
        <button className="ui-btn ui-btn--primary" disabled={!dirty} onClick={save}>
          Save
        </button>
      </div>

      {dialog === 'add' && <AddPlayerDialog event={event} onClose={() => setDialog(null)} />}
      {dialog === 'import' && <ImportPlayersDialog event={event} setEvent={setEvent} onClose={() => setDialog(null)} />}
    </div>
  )
}
