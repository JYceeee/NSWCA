import { COLOR_DEFS, LAYOUT_DEFS, ROW_DEFS, type LookKind } from '../data/menus'
import type { MenuLook, MenuSet, MenuText, Palette, TextStyle, TypographySet } from '../types'
import { findRow, resolveColor, textVars } from './theme'

/** CSS prefix of each menu area / version, e.g. --mn-tb-dark-c-bg. */
export const lookPrefix = (kind: LookKind, version?: 'light' | 'dark') =>
  kind === 'sidebar' ? 'mn-sb' : `mn-${kind === 'topbar' ? 'tb' : 'ft'}-${version ?? 'light'}`

/** The typography row a menu text links to, with the menu's own overrides applied. */
export function mergedStyle(text: MenuText, typo: TypographySet): TextStyle {
  const base = findRow(typo, text.style)
  return {
    ...base,
    font: text.font ?? base.font,
    size: text.size ?? base.size,
    weight: text.weight ?? base.weight,
    uppercase: text.uppercase ?? base.uppercase,
  }
}

function lookVars(prefix: string, kind: LookKind, look: MenuLook, p: Palette, typo: TypographySet) {
  const vars: Record<string, string> = {}
  for (const r of ROW_DEFS[kind]) {
    const text = look.rows[r.id] ?? r.def
    Object.assign(vars, textVars(`${prefix}-${r.id}`, mergedStyle(text, typo)))
    for (const k of ['gap', 'padX', 'padY'] as const) vars[`--${prefix}-${r.id}-${k}`] = `${text[k]}px`
  }
  for (const c of COLOR_DEFS[kind]) {
    const v = c.key in look.colors ? look.colors[c.key] : c.light
    vars[`--${prefix}-c-${c.key}`] = v ? resolveColor(v, p.tokens) : `var(--sidebar-${c.link})`
  }
  for (const l of LAYOUT_DEFS[kind]) vars[`--${prefix}-${l.key}`] = `${look.layout[l.key] ?? l.def}px`
  return vars
}

/** Every CSS variable the sidebar, top bar and footer read. */
export function buildMenuVars(menu: MenuSet, p: Palette, typo: TypographySet): Record<string, string> {
  return {
    ...lookVars(lookPrefix('sidebar'), 'sidebar', menu.sidebar.look, p, typo),
    ...lookVars(lookPrefix('topbar', 'light'), 'topbar', menu.topbar.light, p, typo),
    // Both top bar versions share size and text (kept on the light one); only colours differ.
    ...lookVars(lookPrefix('topbar', 'dark'), 'topbar', { ...menu.topbar.dark, rows: menu.topbar.light.rows, layout: menu.topbar.light.layout }, p, typo),
    ...lookVars(lookPrefix('footer', 'light'), 'footer', menu.footer.light, p, typo),
    ...lookVars(lookPrefix('footer', 'dark'), 'footer', menu.footer.dark, p, typo),
  }
}

/** Reads a menu CSS variable: v('mn-sb', 'c-bg') -> var(--mn-sb-c-bg). */
export const mv = (prefix: string, key: string) => `var(--${prefix}-${key})`
