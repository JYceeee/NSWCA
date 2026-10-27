import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Small window next to a card; closes on outside click, Esc or scroll. */
export function Popover({ rect, onClose, label, children }: { rect: DOMRect; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const gap = 8
    let left = rect.right + gap
    if (left + w > window.innerWidth - 12) left = rect.left - w - gap
    if (left < 12) left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12)
    const top = Math.min(Math.max(12, rect.top), window.innerHeight - h - 12)
    setPos({ left, top })
  }, [rect])

  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const scroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose()
    // Opened by a click – listen from the next tick so that click doesn't close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', down)
      window.addEventListener('scroll', scroll, true)
    })
    window.addEventListener('keydown', key)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', down)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return createPortal(
    <div ref={ref} className="cal-pop" role="dialog" aria-label={label} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}>
      {children}
    </div>,
    document.body,
  )
}
