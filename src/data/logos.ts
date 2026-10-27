import type { LogoSet, LogoSlotKey } from '../types'

/** Default display height of each slot on the site (sidebar, top bar, footer). */
export const LOGO_HEIGHTS: Record<LogoSlotKey, number> = { primary: 26, reversed: 26, icon: 28 }

export const DEFAULT_TAB_TITLE = 'Principles · Design System'

export const tabTitle = (set: LogoSet) => set.tabTitle?.trim() || DEFAULT_TAB_TITLE

/** Primary and reversed share one height (stored under primary); the icon has its own. */
export const heightKey = (slot: LogoSlotKey): LogoSlotKey => (slot === 'reversed' ? 'primary' : slot)

export const logoHeight = (set: LogoSet, slot: LogoSlotKey) => set.heights?.[heightKey(slot)] ?? LOGO_HEIGHTS[heightKey(slot)]

export const LOGO_SLOTS: { key: LogoSlotKey; label: string; desc: string }[] = [
  { key: 'primary', label: 'Primary (full lockup)', desc: 'Icon and wordmark, for light backgrounds' },
  { key: 'reversed', label: 'Reversed / on-dark', desc: 'For dark surfaces such as the footer' },
  { key: 'icon', label: 'Icon / mark only', desc: 'Square mark for favicons and app icons' },
]

const font = `font-family='Wix Madefor Display, Arial, sans-serif'`

function monogramMark(fill: string, fg: string, x = 0) {
  return `<rect x='${x}' y='0' width='64' height='64' rx='16' fill='${fill}'/><text x='${x + 32}' y='44' text-anchor='middle' ${font} font-size='34' font-weight='800' fill='${fg}'>P</text>`
}

function monogramSet(): LogoSet {
  const lockup = (ink: string, mark: string, markFg: string) =>
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 64'>${monogramMark(mark, markFg)}<text x='80' y='43' ${font} font-size='30' font-weight='800' fill='${ink}'>Principles</text></svg>`
  return {
    id: 'logo-monogram', name: 'Monogram', builtin: true,
    slots: {
      primary: { kind: 'svg', name: 'monogram-primary.svg', svg: lockup('#1D1D1F', '#1D1D1F', '#FFFFFF') },
      reversed: { kind: 'svg', name: 'monogram-reversed.svg', svg: lockup('#FFFFFF', '#FFFFFF', '#1D1D1F') },
      icon: { kind: 'svg', name: 'monogram-icon.svg', svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>${monogramMark('#1D1D1F', '#FFFFFF')}</svg>` },
    },
  }
}

function wordmarkSet(): LogoSet {
  const ring = (c: string) => `<circle cx='28' cy='32' r='20' fill='none' stroke='${c}' stroke-width='7'/><circle cx='28' cy='32' r='6' fill='${c}'/>`
  const lockup = (ink: string) =>
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 64'>${ring(ink)}<text x='60' y='43' ${font} font-size='30' font-weight='700' letter-spacing='-1' fill='${ink}'>orbit.</text></svg>`
  return {
    id: 'logo-wordmark', name: 'Orbit wordmark', builtin: true,
    slots: {
      primary: { kind: 'svg', name: 'orbit-primary.svg', svg: lockup('#1D1D1F') },
      reversed: { kind: 'svg', name: 'orbit-reversed.svg', svg: lockup('#FFFFFF') },
      icon: { kind: 'svg', name: 'orbit-icon.svg', svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 56 64'><rect width='56' height='64' rx='14' fill='#1D1D1F'/>${ring('#FFFFFF')}</svg>` },
    },
  }
}

export function builtinLogos(): LogoSet[] {
  return [monogramSet(), wordmarkSet()]
}

export function svgDataUrl(svg: string) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
