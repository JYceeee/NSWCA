import { useEffect, useState, type RefObject } from 'react'

/** Parses computed background colours: rgb(), rgba() and color(srgb …). */
function parseColor(css: string): { r: number; g: number; b: number; a: number } | null {
  let m = css.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] }
  m = css.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/)
  if (m) return { r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a: m[4] == null ? 1 : +m[4] }
  return null
}

/** Walks up from the element at (x, y) – ignoring `skip` – to the first opaque background or data-surface. */
function isDarkAt(x: number, y: number, skip: Element): boolean {
  const hit = document.elementsFromPoint(x, y).find((el) => !skip.contains(el))
  for (let n: Element | null = hit ?? document.body; n; n = n.parentElement) {
    const marked = (n as HTMLElement).dataset?.surface
    if (marked) return marked === 'dark'
    // A section's backdrop (image, overlay) doesn't decide: the section's data-surface does.
    if (n.closest('.bg-layer')) continue
    const col = parseColor(getComputedStyle(n).backgroundColor)
    if (col && col.a >= 0.5) return (0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b) / 255 < 0.5
  }
  return false
}

/**
 * Whether the page area behind an element is dark. `behind` samples at the element's bottom edge, so a sticky
 * bar can tell when it overlaps the next section; `top` samples at its top edge (with `behind`: the section
 * covers the whole bar); `above` samples just above it (the section a footer follows).
 */
export function useDarkSurface(ref: RefObject<HTMLElement>, enabled: boolean, where: 'behind' | 'top' | 'above', deps: unknown[]): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const check = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const y = where === 'behind' ? r.bottom - 1 : where === 'top' ? r.top + 1 : r.top - 4
        if (y < 0 || y > window.innerHeight) return
        setDark(isDarkAt(r.left + r.width / 2, y, el))
      })
    }
    check()
    window.addEventListener('scroll', check, { passive: true, capture: true })
    window.addEventListener('resize', check)
    // Content can change without a scroll (new page, theme edits).
    const poll = window.setInterval(check, 800)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', check, { capture: true })
      window.removeEventListener('resize', check)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, where, ...deps])
  return enabled && dark
}
