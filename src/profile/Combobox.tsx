import { useEffect, useRef, useState } from 'react'

export interface ComboOption {
  value: string
  label: string
  /** Extra text that search also matches, e.g. "+61". */
  keywords?: string
}

/** Searchable dropdown: type to filter, arrows + Enter to pick, Esc to close. */
export function Combobox({
  value, options, onChange, display, className, invalid, ariaLabel, placeholder = 'Search…', listWidth,
}: {
  value: string
  options: ComboOption[]
  onChange: (v: string) => void
  /** Text shown when closed (defaults to the option label). */
  display?: (o: ComboOption | undefined) => string
  className?: string
  invalid?: boolean
  ariaLabel: string
  placeholder?: string
  listWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const selected = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => `${o.label} ${o.keywords ?? ''} ${o.value}`.toLowerCase().includes(q)) : options

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [open])

  useEffect(() => {
    if (!open) return
    const i = Math.max(0, shown.findIndex((o) => o.value === value))
    setActive(q ? 0 : i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q])

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (o: ComboOption) => {
    onChange(o.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className={`combo ${className ?? ''}`} ref={box}>
      <input
        className={['ds-input', 'ds-input--select', invalid && 'ds-input--error'].filter(Boolean).join(' ')}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        value={open ? query : display ? display(selected) : selected?.label ?? ''}
        placeholder={open ? placeholder : ''}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setOpen(true)
          setQuery(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setActive((a) => Math.min(shown.length - 1, a + 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
          else if (e.key === 'Enter' && open && shown[active]) (e.preventDefault(), pick(shown[active]))
          else if (e.key === 'Escape' || e.key === 'Tab') (setOpen(false), setQuery(''))
        }}
      />
      {open && (
        <ul className="combo-list" role="listbox" ref={list} style={listWidth ? { width: listWidth } : undefined}>
          {shown.length ? (
            shown.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={[i === active && 'combo-active', o.value === value && 'combo-selected'].filter(Boolean).join(' ')}
                onMouseDown={(e) => (e.preventDefault(), pick(o))}
                onMouseEnter={() => setActive(i)}
              >
                {o.label}
              </li>
            ))
          ) : (
            <li className="combo-empty">No matches</li>
          )}
        </ul>
      )}
    </div>
  )
}
