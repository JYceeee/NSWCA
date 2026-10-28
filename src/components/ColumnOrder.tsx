import { useState } from 'react'
import { Icon } from './Icon'

/** A table's column order, remembered in this browser under `storageKey`. New columns join at their default spot. */
export function useColumnOrder<K extends string>(storageKey: string, defaults: K[]) {
  const [order, setOrder] = useState<K[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as K[]
      const kept = saved.filter((k) => defaults.includes(k))
      return [...kept, ...defaults.filter((k) => !kept.includes(k))]
    } catch {
      return defaults
    }
  })
  const move = (key: K, by: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(key)
      const j = i + by
      if (i < 0 || j < 0 || j >= o.length) return o
      const n = [...o]
      ;[n[i], n[j]] = [n[j], n[i]]
      try {
        localStorage.setItem(storageKey, JSON.stringify(n))
      } catch {
        // Not saved – the order still applies until the page reloads.
      }
      return n
    })
  return { order, move }
}

/** ‹ › after a column name: moves the column one place left or right. */
export function ColumnMove({ label, first, last, onMove }: { label: string; first: boolean; last: boolean; onMove: (by: -1 | 1) => void }) {
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
