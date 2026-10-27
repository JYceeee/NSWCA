import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { useDialogs } from '../components/Dialogs'
import { blankRow } from '../data/typography'
import { FONTS, fontWeights } from '../lib/fonts'
import { textStyleCss } from '../lib/theme'
import { uid, useBrand, useSelected } from '../store/BrandStore'
import type { TextStyle, TypographySet } from '../types'
import { ItemHeader, ItemSwitcher, NewItemDialog, SaveBar } from './shared'

function duplicateSet(src: TypographySet, id: string, name: string): TypographySet {
  return { ...src, id, name, builtin: false, rowDefaults: Object.fromEntries(src.rows.map((r) => [r.id, { ...r }])) }
}

export const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' }

export function TypographyTab() {
  const set = useSelected('typography')
  const { update, focus } = useBrand()
  const { confirm } = useDialogs()
  const [newFrom, setNewFrom] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    if (focus?.kind !== 'textStyle') return
    setFlash(focus.id)
    document.getElementById(`type-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [focus])

  const setRows = (fn: (rows: TextStyle[]) => TextStyle[], defaults?: (d: TypographySet['rowDefaults']) => TypographySet['rowDefaults']) =>
    update('typography', set.id, (s) => ({ ...s, rows: fn(s.rows), rowDefaults: defaults ? defaults(s.rowDefaults) : s.rowDefaults }))

  const patchRow = (id: string, patch: Partial<TextStyle>) => setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const addRow = () => {
    const row = blankRow(uid('ts'), set.rows.find((r) => r.id === 'p1')?.font ?? 'Wix Madefor Display')
    setRows((rows) => [...rows, row], (d) => ({ ...d, [row.id]: { ...row } }))
    setTimeout(() => document.getElementById(`type-${row.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  const deleteRow = async (row: TextStyle) => {
    const ok = await confirm({ title: `Delete “${row.name}”?`, message: 'Components using this text style fall back to Paragraph 1.', confirmLabel: 'Delete', danger: true })
    if (ok) setRows((rows) => rows.filter((r) => r.id !== row.id))
  }

  const moveRow = (from: string, to: string) =>
    setRows((rows) => {
      const a = rows.findIndex((r) => r.id === from)
      const b = rows.findIndex((r) => r.id === to)
      if (a < 0 || b < 0 || a === b) return rows
      const copy = [...rows]
      const [m] = copy.splice(a, 1)
      copy.splice(b, 0, m)
      return copy
    })

  return (
    <div className="tab-body">
      <ItemSwitcher slice="typography" onNew={() => setNewFrom(set.id)} />
      <div className="panel">
        <ItemHeader slice="typography" item={set} onDuplicate={() => setNewFrom(set.id)} />
        <div className="type-table-wrap">
          <table className="type-table">
            <thead>
              <tr>
                <th aria-label="Reorder" />
                <th>Text name</th>
                <th>Size (px)</th>
                <th>Font</th>
                <th>Style</th>
                <th>Sample</th>
                <th aria-label="Delete" />
              </tr>
            </thead>
            <tbody>
              {set.rows.map((row) => (
                <TypeRow
                  key={row.id}
                  row={row}
                  def={set.rowDefaults[row.id]}
                  flash={flash === row.id}
                  dragging={dragId === row.id}
                  onPatch={(p) => patchRow(row.id, p)}
                  onDelete={() => deleteRow(row)}
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={() => dragId && moveRow(dragId, row.id)}
                  onDragEnd={() => setDragId(null)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <button className="ui-btn add-row" onClick={addRow}>
          <Icon name="plus" size={15} /> Add text style
        </button>
      </div>
      <SaveBar slice="typography" item={set} />
      {newFrom && <NewItemDialog slice="typography" sourceId={newFrom} onClose={() => setNewFrom(null)} make={duplicateSet} />}
    </div>
  )
}

interface RowProps {
  row: TextStyle
  def?: TextStyle
  flash: boolean
  dragging: boolean
  onPatch: (p: Partial<TextStyle>) => void
  onDelete: () => void
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
}

const STYLE_KEYS: (keyof TextStyle)[] = ['weight', 'italic', 'uppercase', 'underline', 'strike', 'letterSpacing', 'lineHeight', 'font']

function TypeRow({ row, def, flash, dragging, onPatch, onDelete, onDragStart, onDragOver, onDragEnd }: RowProps) {
  const [draggable, setDraggable] = useState(false)
  const weights = fontWeights(row.font)
  const styleChanged = def && STYLE_KEYS.some((k) => row[k] !== def[k])
  const toggle = (k: 'italic' | 'uppercase' | 'underline' | 'strike') => onPatch({ [k]: !row[k] })

  return (
    <tr
      id={`type-${row.id}`}
      className={[flash && 'row-flash', dragging && 'row-dragging'].filter(Boolean).join(' ')}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDragEnd={() => {
        setDraggable(false)
        onDragEnd()
      }}
    >
      <td className="cell-grip">
        <span className="grip" onMouseDown={() => setDraggable(true)} onMouseUp={() => setDraggable(false)} title="Drag to reorder">
          <Icon name="grip" size={18} stroke={3} />
        </span>
      </td>
      <td className="cell-name">
        <input className="inline-input inline-input--strong" value={row.name} onChange={(e) => onPatch({ name: e.target.value })} aria-label="Text name" />
        <input className="inline-input inline-input--muted" value={row.description} onChange={(e) => onPatch({ description: e.target.value })} aria-label="Description" />
      </td>
      <td className="cell-size">
        <div className="with-reset">
          <NumberField value={row.size} min={6} max={200} onChange={(size) => size != null && onPatch({ size })} ariaLabel="Size in px" />
          {def && def.size !== row.size && (
            <button className="icon-btn" title={`Reset to ${def.size}`} onClick={() => onPatch({ size: def.size })}>
              <Icon name="reset" size={14} />
            </button>
          )}
        </div>
      </td>
      <td className="cell-font">
        <select
          className="ui-input"
          value={row.font}
          onChange={(e) => {
            const font = e.target.value
            const ws = fontWeights(font)
            const weight = ws.includes(row.weight) ? row.weight : ws.reduce((a, b) => (Math.abs(b - row.weight) < Math.abs(a - row.weight) ? b : a))
            onPatch({ font, weight })
          }}
          aria-label="Font"
        >
          {(['sans', 'serif', 'display', 'mono'] as const).map((cat) => (
            <optgroup key={cat} label={{ sans: 'Sans serif', serif: 'Serif', display: 'Display', mono: 'Monospace' }[cat]}>
              {FONTS.filter((f) => f.category === cat).map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </td>
      <td className="cell-style">
        <div className="style-tools">
          <select className="ui-input weight-select" value={row.weight} onChange={(e) => onPatch({ weight: Number(e.target.value) })} title="Weight" aria-label="Weight">
            {weights.map((w) => (
              <option key={w} value={w}>
                {w} · {WEIGHT_NAMES[w] ?? ''}
              </option>
            ))}
          </select>
          <ToggleBtn on={row.italic} onClick={() => toggle('italic')} title="Italic"><i style={{ fontFamily: 'Georgia, serif', fontWeight: 700 }}>I</i></ToggleBtn>
          <ToggleBtn on={row.uppercase} onClick={() => toggle('uppercase')} title="Uppercase"><span style={{ fontSize: 11, fontWeight: 700 }}>AA</span></ToggleBtn>
          <ToggleBtn on={row.underline} onClick={() => toggle('underline')} title="Underline"><u style={{ fontWeight: 700 }}>U</u></ToggleBtn>
          <ToggleBtn on={row.strike} onClick={() => toggle('strike')} title="Strikethrough"><s style={{ fontWeight: 700 }}>S</s></ToggleBtn>
          <PopNumber icon="spacing" title="Letter spacing (px)" value={row.letterSpacing} step={0.1} min={-5} max={20} onChange={(letterSpacing) => onPatch({ letterSpacing })} active={row.letterSpacing !== 0} />
          <PopNumber icon="lineHeight" title="Line height (× size)" value={row.lineHeight} step={0.05} min={0.8} max={3} onChange={(lineHeight) => onPatch({ lineHeight })} active={def ? row.lineHeight !== def.lineHeight : false} />
          <button
            className="icon-btn"
            title="Reset style"
            disabled={!styleChanged}
            onClick={() => def && onPatch(Object.fromEntries(STYLE_KEYS.map((k) => [k, def[k]])) as Partial<TextStyle>)}
          >
            <Icon name="reset" size={15} />
          </button>
        </div>
      </td>
      <td className="cell-sample">
        <input
          className="sample-input"
          style={textStyleCss(row, row.sampleSize ?? row.size)}
          value={row.sampleText}
          onChange={(e) => onPatch({ sampleText: e.target.value })}
          aria-label="Sample text"
          title="Click to edit the sample text"
        />
        <label className="sample-size">
          Preview
          <NumberField value={row.sampleSize} placeholder={String(row.size)} min={6} max={200} onChange={(n) => onPatch({ sampleSize: n })} allowEmpty ariaLabel="Preview size in px" small />
          px
        </label>
      </td>
      <td className="cell-del">
        {!row.builtin && (
          <button className="icon-btn icon-btn--danger" title="Delete text style" onClick={onDelete}>
            <Icon name="trash" size={15} />
          </button>
        )}
      </td>
    </tr>
  )
}

export function ToggleBtn({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button className={on ? 'tool-btn tool-btn--on' : 'tool-btn'} aria-pressed={on} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

function PopNumber({ icon, title, value, step, min, max, onChange, active }: { icon: string; title: string; value: number; step: number; min: number; max: number; onChange: (n: number) => void; active: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="pop-wrap" ref={ref}>
      <button className={active ? 'tool-btn tool-btn--on' : 'tool-btn'} title={`${title}: ${value}`} onClick={() => setOpen(!open)}>
        <Icon name={icon} size={16} />
      </button>
      {open && (
        <div className="pop">
          <span>{title}</span>
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
          <input className="ui-input" type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        </div>
      )}
    </div>
  )
}

export function NumberField({
  value, onChange, min, max, placeholder, allowEmpty, ariaLabel, small,
}: {
  value: number | null
  onChange: (n: number | null) => void
  min: number
  max: number
  placeholder?: string
  allowEmpty?: boolean
  ariaLabel: string
  small?: boolean
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => setText(value == null ? '' : String(value)), [value])
  const commit = (t: string) => {
    if (t.trim() === '' && allowEmpty) return onChange(null)
    const n = Number(t)
    if (Number.isFinite(n) && t.trim() !== '') onChange(Math.min(max, Math.max(min, n)))
  }
  return (
    <input
      className={small ? 'ui-input num-input num-input--small' : 'ui-input num-input'}
      type="number"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value === '' ? allowEmpty : Number.isFinite(n) && n >= min && n <= max) commit(e.target.value)
      }}
      onBlur={() => {
        commit(text)
        setText(value == null ? '' : String(value))
      }}
    />
  )
}
