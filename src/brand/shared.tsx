import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { Modal, useDialogs } from '../components/Dialogs'
import { assetUrl } from '../lib/db'
import { appliedKey, builtinItem, uid, useBrand } from '../store/BrandStore'
import type { Slices, SliceKey } from '../types'

type Item = Slices[SliceKey][number]

const NOUN: Record<SliceKey, string> = { palettes: 'palette', typography: 'typography set', backgrounds: 'background', logos: 'logo set', menus: 'menu set', events: 'event list', pages: 'page config' }

/** Row of pill tabs to switch between items of a slice, plus "+ New". */
export function ItemSwitcher({ slice, dot, onNew }: { slice: SliceKey; dot?: (item: Item) => ReactNode; onNew: () => void }) {
  const { draft, ui, select, saved } = useBrand()
  const list = draft[slice] as Item[]
  const applied = saved.applied[appliedKey(slice)]
  return (
    <div className="item-switcher" role="tablist">
      {list.map((i) => (
        <button key={i.id} role="tab" aria-selected={ui.selected[slice] === i.id} className="item-tab" onClick={() => select(slice, i.id)}>
          {dot?.(i)}
          <span>{i.name}</span>
          {applied === i.id && <span className="item-tab-applied" title="Applied to site" />}
        </button>
      ))}
      <button className="item-tab item-tab--new" onClick={onNew}>
        <Icon name="plus" size={14} /> New {NOUN[slice]}
      </button>
    </div>
  )
}

export function EditableTitle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => {
    setEditing(false)
    if (text.trim()) onChange(text.trim())
    else setText(value)
  }
  return editing ? (
    <input className="title-input" value={text} autoFocus onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => (e.key === 'Enter' ? commit() : e.key === 'Escape' && (setText(value), setEditing(false)))} />
  ) : (
    <button className="title-btn" onClick={() => setEditing(true)} title="Rename">
      <h2>{value}</h2>
      <Icon name="edit" size={15} />
    </button>
  )
}

/** Title (rename), applied badge, Apply / Duplicate / Delete and any extra actions. */
export function ItemHeader({ slice, item, onDuplicate, extra }: { slice: SliceKey; item: Item; onDuplicate: () => void; extra?: ReactNode }) {
  const { saved, update, apply, removeItem, addItem, dirty } = useBrand()
  const { confirm, toast } = useDialogs()
  const isApplied = saved.applied[appliedKey(slice)] === item.id

  const del = async () => {
    const ok = await confirm({ title: `Delete “${item.name}”?`, message: `This ${NOUN[slice]} will be removed. You can undo straight after.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    const removed = removeItem(slice, item.id)
    if (removed) toast(`Deleted “${item.name}”`, { label: 'Undo', run: () => addItem(slice, removed.item as never, removed.index) })
  }

  return (
    <div className="item-header">
      <div className="item-header-title">
        <EditableTitle value={item.name} onChange={(name) => update(slice, item.id, (i) => ({ ...i, name }))} />
        {isApplied && <span className="badge-applied">Applied to site</span>}
        {!item.builtin && <span className="badge-custom">Custom</span>}
      </div>
      <div className="item-header-actions">
        {extra}
        <button className="ui-btn" onClick={onDuplicate}>
          <Icon name="copy" size={15} /> Duplicate
        </button>
        {!isApplied && (
          <button className="ui-btn ui-btn--primary" onClick={() => apply(slice, item.id)} title={dirty[slice] ? 'Saves your changes and applies this to the site' : undefined}>
            {dirty[slice] ? 'Save & apply to site' : 'Apply to site'}
          </button>
        )}
        {!item.builtin && (
          <button className="ui-btn ui-btn--danger" onClick={del}>
            <Icon name="trash" size={15} /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

/** Sticky footer: Reset to defaults (built-ins), Discard changes, Save. */
export function SaveBar({ slice, item, noReset }: { slice: SliceKey; item: Item; noReset?: boolean }) {
  const { dirty, save, discard, update } = useBrand()
  const { confirm, toast } = useDialogs()

  const reset = async () => {
    const ok = await confirm({
      title: `Reset “${item.name}” to defaults?`,
      message: 'All edits to this item are replaced with its original values. Nothing is saved until you click Save.',
      confirmLabel: 'Reset',
      danger: true,
    })
    if (!ok) return
    const def = builtinItem(slice, item.id)
    if (def) update(slice, item.id, () => structuredClone(def) as never)
  }

  return (
    <div className="save-bar">
      <span className={dirty[slice] ? 'save-status save-status--dirty' : 'save-status'}>{dirty[slice] ? 'Unsaved changes' : 'All changes saved'}</span>
      {item.builtin && !noReset && (
        <button className="ui-btn" onClick={reset}>
          Reset to defaults
        </button>
      )}
      <button className="ui-btn" disabled={!dirty[slice]} onClick={() => discard(slice)}>
        Discard changes
      </button>
      <button
        className="ui-btn ui-btn--primary"
        disabled={!dirty[slice]}
        onClick={() => {
          save(slice)
          toast('Changes saved')
        }}
      >
        Save
      </button>
    </div>
  )
}

/** Name + "copy from" dialog used by every "New …" / "Duplicate" button. */
export function NewItemDialog<K extends SliceKey>({
  slice,
  sourceId,
  onClose,
  make,
  extra,
}: {
  slice: K
  sourceId: string
  onClose: () => void
  /** Build the new item from the (saved) source. */
  make: (source: Slices[K][number], id: string, name: string) => Slices[K][number]
  extra?: ReactNode
}) {
  const { saved, addItem, draft } = useBrand()
  const list = draft[slice] as Item[]
  const [from, setFrom] = useState(sourceId)
  const src = list.find((i) => i.id === from) ?? list[0]
  const [name, setName] = useState(`${src.name} copy`)
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!touched) setName(`${src.name} copy`)
  }, [src.name, touched])

  const create = () => {
    // Copy the saved version so unsaved edits stay with the original.
    const base = ((saved[slice] as Item[]).find((i) => i.id === from) ?? src) as Slices[K][number]
    addItem(slice, make(structuredClone(base), uid(slice.slice(0, 3)), name.trim() || 'Untitled'))
    onClose()
  }

  return (
    <Modal title={`New ${NOUN[slice]}`} onClose={onClose} width={440}>
      <div className="modal-body form">
        <label className="form-row">
          <span>Name</span>
          <input
            className="ui-input"
            value={name}
            autoFocus
            onChange={(e) => {
              setTouched(true)
              setName(e.target.value)
            }}
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
        </label>
        <label className="form-row">
          <span>Copy from</span>
          <select className="ui-input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {list.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        {extra}
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Cancel</button>
        <button className="ui-btn ui-btn--primary" onClick={create}>Create</button>
      </div>
    </Modal>
  )
}

export function useAssetUrl(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (id) assetUrl(id).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [id])
  return url
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="section-title">{children}</h4>
}
