import type { CSSProperties } from 'react'
import { COMPONENTS, schemaDefault } from '../data/components'
import { TOKEN_KEYS } from '../data/tokens'
import type { ColorRef, FieldValue, Palette, TextStyle, Tokens, TypographySet } from '../types'
import { ensureFont, fontStack } from './fonts'
import { toCss } from './color'

export function resolveColor(ref: ColorRef, tokens: Tokens): string {
  const hex = ref.token ? tokens[ref.token] : ref.hex
  return toCss(hex ?? '#000000', ref.alpha ?? 100)
}

/** Hex (no alpha) of a ColorRef, for swatches and inputs. */
export function refHex(ref: ColorRef, tokens: Tokens): string {
  return (ref.token ? tokens[ref.token] : ref.hex) ?? '#000000'
}

export function getField(p: Palette, componentId: string, key: string): FieldValue {
  const o = p.components[componentId]
  return o && key in o ? o[key] : schemaDefault(componentId, key)
}

export function fieldDefault(p: Palette, componentId: string, key: string): FieldValue {
  const o = p.componentDefaults[componentId]
  return o && key in o ? o[key] : schemaDefault(componentId, key)
}

export function findRow(set: TypographySet, id: string): TextStyle {
  return set.rows.find((r) => r.id === id) ?? set.rows.find((r) => r.id === 'p1') ?? set.rows[0]
}

const SHADOWS: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgba(0,0,0,.05), 0 1px 3px rgba(0,0,0,.04)',
  md: '0 4px 12px rgba(0,0,0,.08)',
  lg: '0 12px 32px rgba(0,0,0,.14)',
}

export function textVars(prefix: string, row: TextStyle, size?: number | null, weight?: number | null): Record<string, string> {
  ensureFont(row.font)
  const deco = [row.underline && 'underline', row.strike && 'line-through'].filter(Boolean).join(' ') || 'none'
  return {
    [`--${prefix}-font`]: fontStack(row.font),
    [`--${prefix}-size`]: `${size ?? row.size}px`,
    [`--${prefix}-weight`]: String(weight ?? row.weight),
    [`--${prefix}-style`]: row.italic ? 'italic' : 'normal',
    [`--${prefix}-transform`]: row.uppercase ? 'uppercase' : 'none',
    [`--${prefix}-decoration`]: deco,
    [`--${prefix}-ls`]: `${row.letterSpacing}px`,
    [`--${prefix}-lh`]: String(row.lineHeight),
  }
}

/** Inline style that reads a text style from CSS variables set by buildThemeVars. */
export function ty(prefix: string): CSSProperties {
  return {
    fontFamily: `var(--${prefix}-font)`,
    fontSize: `var(--${prefix}-size)`,
    fontWeight: `var(--${prefix}-weight)` as CSSProperties['fontWeight'],
    fontStyle: `var(--${prefix}-style)`,
    textTransform: `var(--${prefix}-transform)` as CSSProperties['textTransform'],
    textDecoration: `var(--${prefix}-decoration)`,
    letterSpacing: `var(--${prefix}-ls)`,
    lineHeight: `var(--${prefix}-lh)`,
  }
}

export function textStyleCss(row: TextStyle, size?: number): CSSProperties {
  ensureFont(row.font)
  return {
    fontFamily: fontStack(row.font),
    fontSize: size ?? row.size,
    fontWeight: row.weight,
    fontStyle: row.italic ? 'italic' : 'normal',
    textTransform: row.uppercase ? 'uppercase' : 'none',
    textDecoration: [row.underline && 'underline', row.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
    letterSpacing: row.letterSpacing,
    lineHeight: row.lineHeight,
  }
}

/** Every CSS variable a palette + typography set defines: tokens, typography rows and components. */
export function buildThemeVars(p: Palette, typo: TypographySet): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const k of TOKEN_KEYS) vars[`--t-${k}`] = p.tokens[k]
  for (const row of typo.rows) Object.assign(vars, textVars(`ty-${row.id}`, row))

  for (const c of COMPONENTS) {
    for (const g of c.groups) {
      for (const f of g.fields) {
        const v = getField(p, c.id, f.key)
        const name = `--${c.id}-${f.key}`
        if (f.type === 'color') vars[name] = resolveColor(v as ColorRef, p.tokens)
        else if (f.type === 'number') vars[name] = `${v}px`
        else if (f.type === 'select' && f.key === 'shadow') vars[name] = SHADOWS[v as string] ?? 'none'
        else if (f.type === 'textStyle') {
          const row = findRow(typo, v as string)
          const size = getField(p, c.id, 'sizeOverride') as number | null
          const weight = getField(p, c.id, 'weightOverride') as number | null
          Object.assign(vars, textVars(`${c.id}-${f.key}`, row, size, weight))
        }
      }
    }
  }
  return vars
}

/** Palette tokens + resolved component variables as a :root block. */
export function paletteCss(p: Palette, typo: TypographySet): string {
  const vars = buildThemeVars(p, typo)
  const lines = [`/* ${p.name} */`, ':root {', '  /* Tokens */']
  for (const k of TOKEN_KEYS) lines.push(`  --${k}: ${p.tokens[k]};`)
  lines.push('', '  /* Components */')
  for (const c of COMPONENTS) {
    for (const g of c.groups) {
      for (const f of g.fields) {
        if (f.type === 'color' || f.type === 'number' || (f.type === 'select' && f.key === 'shadow')) {
          lines.push(`  --${kebab(c.id)}-${kebab(f.key)}: ${vars[`--${c.id}-${f.key}`]};`)
        }
      }
    }
  }
  lines.push('}')
  return lines.join('\n')
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
