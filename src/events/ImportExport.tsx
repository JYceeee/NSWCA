import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { fmtDate, inRange, timeLabel } from '../data/events'
import { uid } from '../store/BrandStore'
import type { CalEvent, EventBook } from '../types'
import { addWarnings, applyImport, checkRows, downloadTemplate, exportEvents, readFile, type ImportRow } from './spreadsheet'

/** Secondary "Import / Export" button with its menu. */
export function ImportExportMenu({ onImport, onExport }: { onImport?: () => void; onExport?: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { toast } = useDialogs()
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="view-menu" ref={ref}>
      <button className="ui-btn ui-btn--secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="download" size={15} /> Import / Export <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="view-menu-list" role="menu">
          {onImport && (
            <button role="menuitem" className="view-menu-item" onClick={pick(onImport)}>
              <Icon name="upload" size={15} /> Import events
            </button>
          )}
          {onExport && (
            <button role="menuitem" className="view-menu-item" onClick={pick(onExport)}>
              <Icon name="download" size={15} /> Export events
            </button>
          )}
          <button role="menuitem" className="view-menu-item" onClick={pick(() => downloadTemplate().catch(() => toast('Could not create the template')))}>
            <Icon name="grid" size={15} /> Download template
          </button>
        </div>
      )}
    </div>
  )
}

const STATUS: Record<ImportRow['status'], string> = { new: 'New', update: 'Updates existing', problem: 'Problem' }

/** Choose a file, check every row, then import. Saved straight away. */
export function ImportDialog({ book, commit, onClose }: { book: EventBook; commit: (fn: (b: EventBook) => EventBook) => void; onClose: () => void }) {
  const { toast } = useDialogs()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<string | null>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  /** Row numbers to import. Clean rows start ticked, rows with warnings unticked. */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [onlyWarned, setOnlyWarned] = useState(false)

  const load = async (f: File) => {
    setBusy(true)
    setError(null)
    setRows(null)
    setFile(f.name)
    try {
      const { rows: raw, rowNumbers } = await readFile(f)
      if (!raw.length) throw new Error('No events found below the header row.')
      const checked = addWarnings(checkRows(raw, rowNumbers, book.events, book.categories, () => uid('ev')), book.events)
      setRows(checked)
      setPicked(new Set(checked.filter((r) => r.status !== 'problem' && !r.warnings.length).map((r) => r.row)))
      setOnlyWarned(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const ok = rows?.filter((r) => r.status !== 'problem') ?? []
  const warned = ok.filter((r) => r.warnings.length)
  const chosen = ok.filter((r) => picked.has(r.row))
  const count = (s: ImportRow['status']) => rows?.filter((r) => r.status === s).length ?? 0
  const toggle = (row: number) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(row)) n.delete(row)
      else n.add(row)
      return n
    })
  const setWarned = (on: boolean) =>
    setPicked((p) => {
      const n = new Set(p)
      for (const r of warned) on ? n.add(r.row) : n.delete(r.row)
      return n
    })
  const shown = (onlyWarned ? rows?.filter((r) => r.warnings.length) : rows) ?? []
  const newCats = [...new Set(chosen.flatMap((r) => (r.newCategory ? [r.newCategory] : [])))]
  const allCats = [...new Set(ok.flatMap((r) => (r.newCategory ? [r.newCategory] : [])))]
  const catName = (id: string) => book.categories.find((c) => c.id === id)?.name ?? (id.startsWith('new:') ? allCats.find((n) => `new:${n.toLowerCase()}` === id) : '') ?? ''

  const run = () => {
    if (!rows) return
    commit((b) => ({ ...b, ...applyImport(chosen, b.events, b.categories, () => uid('cat')) }))
    const n = chosen.filter((r) => r.status === 'new').length
    const u = chosen.filter((r) => r.status === 'update').length
    toast(`Imported ${n} new event${n === 1 ? '' : 's'}${u ? `, updated ${u}` : ''}`)
    onClose()
  }

  return (
    <Modal title="Import events" onClose={onClose} width={880}>
      <div className="modal-body">
        <div
          className={over ? 'dropzone dropzone--over' : 'dropzone'}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) load(f)
          }}
        >
          <Icon name="upload" size={22} />
          <div>
            <strong>{file ?? 'Drop an Excel (.xlsx) or CSV file here'}</strong>
            <span className="small">
              Columns: Name, Start date, End date, All day, Start time, End time, Location, Category, Description. Dates like 25/10/2026.
            </span>
          </div>
          <button className="ui-btn" onClick={() => input.current?.click()} disabled={busy}>
            {file ? 'Choose another file' : 'Choose file'}
          </button>
          <button className="ui-btn" onClick={() => downloadTemplate().catch(() => toast('Could not create the template'))}>
            <Icon name="download" size={14} /> Template
          </button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".xlsx,.csv,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) load(f)
              e.target.value = ''
            }}
          />
        </div>
        {busy && <p className="muted">Reading the file…</p>}
        {error && <p className="form-error ie-error">{error}</p>}
        {rows && (
          <>
            <div className="ie-summary">
              <span className="ie-pill ie-pill--new">{count('new')} new</span>
              <span className="ie-pill ie-pill--update">{count('update')} update existing</span>
              <span className="ie-pill ie-pill--problem">{count('problem')} with problems – skipped</span>
              {warned.length > 0 && <span className="ie-pill ie-pill--warn">⚠ {warned.length} with warnings</span>}
              {newCats.length > 0 && <span className="muted small">New categories: {newCats.join(', ')}</span>}
            </div>
            {warned.length > 0 && (
              <div className="ie-warn-bar">
                <label className="check">
                  <input type="checkbox" checked={onlyWarned} onChange={(e) => setOnlyWarned(e.target.checked)} />
                  Show only rows with warnings
                </label>
                <button className="ui-btn ui-btn--small" onClick={() => setWarned(true)}>Tick all warned</button>
                <button className="ui-btn ui-btn--small" onClick={() => setWarned(false)}>Untick all warned</button>
              </div>
            )}
            <div className="ie-table-wrap">
              <table className="ie-table">
                <thead>
                  <tr>
                    <th aria-label="Import" />
                    <th>Row</th>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Location</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.row} className={[`ie-row--${r.status}`, r.status !== 'problem' && !picked.has(r.row) && 'ie-row--off'].filter(Boolean).join(' ')}>
                      <td>
                        {r.status !== 'problem' && (
                          <input type="checkbox" checked={picked.has(r.row)} onChange={() => toggle(r.row)} aria-label={`Import row ${r.row}`} />
                        )}
                      </td>
                      <td>{r.row}</td>
                      <td>
                        <span className={`ie-pill ie-pill--${r.status}`}>{STATUS[r.status]}</span>
                        {r.reason && <div className="ie-reason">{r.reason}</div>}
                        {r.warnings.length > 0 && (
                          <ul className="ie-warnings">
                            {r.warnings.map((w, i) => (
                              <li key={i}>⚠ {w}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{r.event?.name ?? String(r.raw.Name ?? '')}</td>
                      <td>{r.event ? (r.event.endDate === r.event.startDate ? r.event.startDate : `${r.event.startDate} → ${r.event.endDate}`) : ''}</td>
                      <td>{r.event ? timeLabel(r.event) : ''}</td>
                      <td>{r.event?.location}</td>
                      <td>{r.event ? catName(r.event.category) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Cancel</button>
        <button className="ui-btn ui-btn--primary" disabled={!chosen.length} onClick={run}>
          Import {chosen.length} event{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  )
}

type Kind = 'month' | 'quarter' | 'year'
type Basis = 'calendar' | 'financial'

/** Start/end and filename of an export period. Financial year = 1 Jul – 30 Jun; `year` is the year it starts. */
function period(kind: Kind, basis: Basis, month: Date, quarter: number, year: number) {
  if (kind === 'month') return { from: startOfMonth(month), to: endOfMonth(month), label: format(month, 'MMMM yyyy'), file: `events-${format(month, 'MMMM-yyyy')}` }
  const fy = basis === 'financial'
  const yearStart = fy ? new Date(year, 6, 1) : new Date(year, 0, 1)
  const fyName = `FY${year}-${String(year + 1).slice(2)}`
  if (kind === 'year')
    return { from: yearStart, to: endOfMonth(addMonths(yearStart, 11)), label: fy ? `FY ${year}–${String(year + 1).slice(2)}` : String(year), file: `events-${fy ? fyName : year}` }
  const from = addMonths(yearStart, (quarter - 1) * 3)
  return {
    from,
    to: endOfMonth(addMonths(from, 2)),
    label: `Q${quarter} ${fy ? `FY ${year}–${String(year + 1).slice(2)}` : year} (${format(from, 'MMM')} – ${format(addMonths(from, 2), 'MMM yyyy')})`,
    file: `events-${fy ? fyName : year}-Q${quarter}`,
  }
}

/** Pick Month / Quarter / Year (calendar or financial) and export the events in it. */
export function ExportDialog({ book, shownFrom, onClose }: { book: EventBook; shownFrom: Date; onClose: () => void }) {
  const { toast } = useDialogs()
  const [kind, setKind] = useState<Kind>('month')
  const [basis, setBasis] = useState<Basis>('calendar')
  const [month, setMonth] = useState(() => startOfMonth(shownFrom))
  const calQuarter = Math.floor(shownFrom.getMonth() / 3) + 1
  const fyYear = shownFrom.getMonth() >= 6 ? shownFrom.getFullYear() : shownFrom.getFullYear() - 1
  const fyQuarter = Math.floor(((shownFrom.getMonth() + 6) % 12) / 3) + 1
  const [quarter, setQuarter] = useState(calQuarter)
  const [year, setYear] = useState(shownFrom.getFullYear())
  const [busy, setBusy] = useState(false)

  // Switching basis keeps pointing at the period the calendar shows.
  const setBasisKeep = (b: Basis) => {
    setBasis(b)
    setQuarter(b === 'financial' ? fyQuarter : calQuarter)
    setYear(b === 'financial' ? fyYear : shownFrom.getFullYear())
  }

  const p = period(kind, basis, month, quarter, year)
  const events: CalEvent[] = book.events.filter((e) => inRange(e, p.from, p.to))

  const run = async () => {
    setBusy(true)
    try {
      await exportEvents(events, book.categories, `${p.file}.xlsx`)
      toast(`Exported ${events.length} event${events.length === 1 ? '' : 's'}`)
      onClose()
    } catch {
      toast('Could not create the Excel file')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export events" onClose={onClose} width={480}>
      <div className="modal-body form">
        <div className="form-row">
          <span>Period</span>
          <div className="segmented">
            {(['month', 'quarter', 'year'] as Kind[]).map((k) => (
              <button key={k} className={kind === k ? 'seg seg--on' : 'seg'} onClick={() => setKind(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {kind !== 'month' && (
          <div className="form-row">
            <span>Year type</span>
            <div className="segmented">
              <button className={basis === 'calendar' ? 'seg seg--on' : 'seg'} onClick={() => setBasisKeep('calendar')}>
                Calendar (Jan – Dec)
              </button>
              <button className={basis === 'financial' ? 'seg seg--on' : 'seg'} onClick={() => setBasisKeep('financial')}>
                Financial (Jul – Jun)
              </button>
            </div>
          </div>
        )}
        {kind === 'month' ? (
          <label className="form-row">
            <span>Month</span>
            <input type="month" className="ui-input" value={format(month, 'yyyy-MM')} onChange={(e) => e.target.value && setMonth(new Date(`${e.target.value}-01T00:00`))} />
          </label>
        ) : (
          <div className="ev-form-pair">
            {kind === 'quarter' && (
              <label className="form-row">
                <span>Quarter</span>
                <select className="ui-input" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q} ({format(addMonths(basis === 'financial' ? new Date(2000, 6, 1) : new Date(2000, 0, 1), (q - 1) * 3), 'MMM')} –{' '}
                      {format(addMonths(basis === 'financial' ? new Date(2000, 6, 1) : new Date(2000, 0, 1), (q - 1) * 3 + 2), 'MMM')})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-row">
              <span>{basis === 'financial' ? 'Financial year' : 'Year'}</span>
              <select className="ui-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => shownFrom.getFullYear() - 5 + i).map((y) => (
                  <option key={y} value={y}>
                    {basis === 'financial' ? `FY ${y}–${String(y + 1).slice(2)}` : y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div className="ie-export-summary">
          <strong>{p.label}</strong>
          <span>
            {fmtDate(p.from) === fmtDate(p.to) ? '' : `${format(p.from, 'd MMM yyyy')} – ${format(p.to, 'd MMM yyyy')} · `}
            {events.length} event{events.length === 1 ? '' : 's'} · {p.file}.xlsx
          </span>
        </div>
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Cancel</button>
        <button className="ui-btn ui-btn--primary" disabled={busy || !events.length} onClick={run}>
          <Icon name="download" size={15} /> {busy ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </Modal>
  )
}
