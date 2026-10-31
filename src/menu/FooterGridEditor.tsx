import { useState } from 'react'
import { SectionTitle } from '../brand/shared'
import { Icon, socialIcon } from '../components/Icon'
import { CELL_KINDS, newCell, PAGES, pageLabel, SOCIALS } from '../data/menus'
import { uid } from '../store/BrandStore'
import type { FooterCell, FooterColumn, MenuSet } from '../types'

type Footer = MenuSet['footer']
type DragSrc = { from: 'palette'; cell: FooterCell } | { from: 'cell'; col: number; row: number }

const MAX_COLS = 6
const MAX_ROWS = 12
const empty = (): FooterCell => ({ kind: 'empty' })
const kindMeta = (k: FooterCell['kind']) => CELL_KINDS.find((c) => c.kind === k)

/** Columns × rows grid. Drag pages and elements from the list into cells; drag cells to swap them. */
export function FooterGridEditor({ footer, onChange }: { footer: Footer; onChange: (patch: Partial<Footer>) => void }) {
  const cols = footer.columns
  const [drag, setDrag] = useState<DragSrc | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const placed = new Set(cols.flatMap((c) => c.cells.flatMap((x) => (x.kind === 'page' ? [x.page] : []))))

  const setCols = (columns: FooterColumn[]) => onChange({ columns })
  const editCells = (fn: (next: FooterColumn[]) => void) => {
    const next = cols.map((c) => ({ ...c, cells: [...c.cells] }))
    fn(next)
    setCols(next)
  }

  const drop = (col: number, row: number) => {
    setOver(null)
    if (!drag) return
    editCells((next) => {
      if (drag.from === 'cell') {
        const src = next[drag.col].cells[drag.row]
        next[drag.col].cells[drag.row] = next[col].cells[row]
        next[col].cells[row] = src
        return
      }
      const cell = drag.cell
      // A page appears once: dropping it again moves it.
      if (cell.kind === 'page') for (const c of next) c.cells = c.cells.map((x) => (x.kind === 'page' && x.page === cell.page ? empty() : x))
      next[col].cells[row] = structuredClone(cell)
    })
    setDrag(null)
  }

  const setColCount = (n: number) => {
    if (n < 1 || n > MAX_COLS) return
    if (n > cols.length) setCols([...cols, ...Array.from({ length: n - cols.length }, () => ({ id: uid('col'), cells: [empty(), empty(), empty()] }))])
    else setCols(cols.slice(0, n))
  }
  const moveCol = (ci: number, by: -1 | 1) => {
    const next = [...cols]
    ;[next[ci], next[ci + by]] = [next[ci + by], next[ci]]
    setCols(next)
  }
  const setRowCount =(ci: number, n: number) => {
    if (n < 1 || n > MAX_ROWS) return
    editCells((next) => {
      const cells = next[ci].cells
      next[ci].cells = n > cells.length ? [...cells, ...Array.from({ length: n - cells.length }, empty)] : cells.slice(0, n)
    })
  }

  const startPalette = (e: React.DragEvent, cell: FooterCell) => {
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('text/plain', cell.kind)
    setDrag({ from: 'palette', cell })
  }

  return (
    <>
      <SectionTitle>Columns & rows</SectionTitle>
      <div className="fg-toolbar">
        <Stepper label="Columns" value={cols.length} min={1} max={MAX_COLS} onChange={setColCount} />
        <span className="muted small">Drag pages and elements into the cells. Drag a filled cell onto another to swap them.</span>
      </div>
      <div className="fg-layout">
        <div className="fg-palette">
          <div className="fg-palette-label">Pages</div>
          {PAGES.map((p) => (
            <span
              key={p.id}
              draggable
              className={placed.has(p.id) ? 'fg-chip fg-chip--placed' : 'fg-chip'}
              title={placed.has(p.id) ? 'Already in the footer – drag to move it' : 'Drag into a cell'}
              onDragStart={(e) => startPalette(e, { kind: 'page', page: p.id })}
              onDragEnd={() => setDrag(null)}
            >
              <Icon name="grip" size={14} stroke={3} /> {p.label}
              {placed.has(p.id) && <Icon name="check" size={13} />}
            </span>
          ))}
          <div className="fg-palette-label">Elements</div>
          {CELL_KINDS.map((k) => (
            <span key={k.kind} draggable className="fg-chip" title="Drag into a cell" onDragStart={(e) => startPalette(e, newCell(k.kind))} onDragEnd={() => setDrag(null)}>
              <Icon name="grip" size={14} stroke={3} /> <Icon name={k.icon} size={14} /> {k.label}
            </span>
          ))}
        </div>
        <div className="fg-grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(170px, 1fr))` }}>
          {cols.map((col, ci) => (
            <div key={col.id} className="fg-col">
              <div className="fg-col-head">
                <span className="col-head">
                  <strong>Column {ci + 1}</strong>
                  <ColumnMove label={`column ${ci + 1}`} first={ci === 0} last={ci === cols.length - 1} onMove={(by) => moveCol(ci, by)} />
                </span>
                <Stepper label="Rows" value={col.cells.length} min={1} max={MAX_ROWS} onChange={(n) => setRowCount(ci, n)} small />
                {cols.length > 1 && (
                  <button className="icon-btn icon-btn--danger" title="Remove column" onClick={() => setCols(cols.filter((c) => c.id !== col.id))}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
              {col.cells.map((cell, ri) => {
                const key = `${ci}-${ri}`
                return (
                  <CellEditor
                    key={key}
                    cell={cell}
                    over={over === key}
                    dragging={drag?.from === 'cell' && drag.col === ci && drag.row === ri}
                    onChange={(c) => editCells((next) => void (next[ci].cells[ri] = c))}
                    onDragStart={() => setDrag({ from: 'cell', col: ci, row: ri })}
                    onDragEnd={() => {
                      setDrag(null)
                      setOver(null)
                    }}
                    onDragOver={() => drag && setOver(key)}
                    onDragLeave={() => setOver((o) => (o === key ? null : o))}
                    onDrop={() => drop(ci, ri)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <SectionTitle>Social icons</SectionTitle>
      <div className="social-list">
        {footer.socials.map((s, i) => {
          const set = (patch: Partial<typeof s>) => onChange({ socials: footer.socials.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
          return (
            <div key={s.platform} className="social-row">
              <label className="check">
                <input type="checkbox" checked={s.on} onChange={(e) => set({ on: e.target.checked })} />
                <Icon name={socialIcon(s.platform)} size={16} />
                {SOCIALS.find((x) => x.platform === s.platform)?.label}
              </label>
              <input className="ui-input" placeholder="https://…" value={s.url} disabled={!s.on} onChange={(e) => set({ url: e.target.value })} aria-label="Link" />
            </div>
          )
        })}
        <p className="muted small">Shown wherever a “Social icons” element sits in the grid.</p>
      </div>
    </>
  )
}

function Stepper({ label, value, min, max, onChange, small }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; small?: boolean }) {
  return (
    <span className={small ? 'stepper stepper--small' : 'stepper'}>
      <span>{label}</span>
      <button className="icon-btn" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label.toLowerCase()}`}>
        <Icon name="minus" size={14} />
      </button>
      <strong>{value}</strong>
      <button className="icon-btn" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label.toLowerCase()}`}>
        <Icon name="plus" size={14} />
      </button>
    </span>
  )
}

/** ‹ › after a column name: moves the column one place left or right. */
function ColumnMove({ label, first, last, onMove }: { label: string; first: boolean; last: boolean; onMove: (by: -1 | 1) => void }) {
  return (
    <span className="col-move">
      <button type="button" disabled={first} aria-label={`Move ${label} left`} title="Move left" onClick={() => onMove(-1)}>
        <Icon name="chevronLeft" size={12} />
      </button>
      <button type="button" disabled={last} aria-label={`Move ${label} right`} title="Move right" onClick={() => onMove(1)}>
        <Icon name="chevron" size={12} />
      </button>
    </span>
  )
}

interface CellProps {
  cell: FooterCell
  over: boolean
  dragging: boolean
  onChange: (c: FooterCell) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
}

function CellEditor({ cell, over, dragging, onChange, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }: CellProps) {
  const [draggable, setDraggable] = useState(false)
  const filled = cell.kind !== 'empty'
  return (
    <div
      className={['fg-cell', !filled && 'fg-cell--empty', over && 'fg-cell--over', dragging && 'row-dragging'].filter(Boolean).join(' ')}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', cell.kind)
        onDragStart()
      }}
      onDragEnd={() => {
        setDraggable(false)
        onDragEnd()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      {!filled ? (
        <span className="fg-empty">Drop here</span>
      ) : (
        <>
          <span className="grip" onMouseDown={() => setDraggable(true)} onMouseUp={() => setDraggable(false)} title="Drag to move">
            <Icon name="grip" size={16} stroke={3} />
          </span>
          <div className="fg-cell-body">
            <span className="fg-cell-kind">
              <Icon name={cell.kind === 'page' ? 'link' : kindMeta(cell.kind)?.icon ?? 'link'} size={12} />
              {cell.kind === 'page' ? 'Page link' : kindMeta(cell.kind)?.label}
            </span>
            {cell.kind === 'page' && <strong>{pageLabel(cell.page)}</strong>}
            {cell.kind === 'logo' && <strong>Logo</strong>}
            {cell.kind === 'social' && <strong>Social icons</strong>}
            {(cell.kind === 'heading' || cell.kind === 'copyright' || cell.kind === 'text') && (
              <input className="inline-input inline-input--strong" value={cell.text} onChange={(e) => onChange({ ...cell, text: e.target.value })} aria-label="Text" />
            )}
            {cell.kind === 'text' && (
              <input className="inline-input inline-input--muted" value={cell.url} placeholder="Link (optional)" onChange={(e) => onChange({ ...cell, url: e.target.value })} aria-label="Link" />
            )}
          </div>
          <button className="icon-btn" title="Clear cell" onClick={() => onChange(empty())}>
            <Icon name="x" size={14} />
          </button>
        </>
      )}
    </div>
  )
}
