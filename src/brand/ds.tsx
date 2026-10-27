// Themed building blocks rendered from CSS variables (see buildThemeVars).
// Used by the pinned preview, the Components tab samples and the app chrome.
import { createContext, useContext, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { buildThemeVars, getField, ty } from '../lib/theme'
import type { Palette, TypographySet } from '../types'

const PaletteCtx = createContext<Palette | null>(null)

export function ThemeScope({ palette, typo, children, className, style, ...rest }: { palette: Palette; typo: TypographySet; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const vars = useMemo(() => buildThemeVars(palette, typo), [palette, typo])
  return (
    <PaletteCtx.Provider value={palette}>
      <div className={className} style={{ ...(vars as CSSProperties), ...style }} {...rest}>
        {children}
      </div>
    </PaletteCtx.Provider>
  )
}

function useLabel(id: string, key = 'label') {
  const p = useContext(PaletteCtx)
  return p ? String(getField(p, id, key) ?? '') : ''
}

const v = (id: string, k: string) => `var(--${id}-${k})`

/** Inline hints for the pinned preview's token tooltip + click target. */
export interface Hint {
  tokens?: string
  target?: string
}
const hintAttrs = (h?: Hint) => (h ? { 'data-tokens': h.tokens, 'data-target': h.target } : {})

export type ButtonId = 'btnPrimary' | 'btnSecondary' | 'btnSoft' | 'btnDanger'

export function DsButton({ id, state, label, hint }: { id: ButtonId; state?: 'hover' | 'pressed' | 'disabled'; label?: string; hint?: Hint }) {
  const text = useLabel(id)
  const style = {
    background: v(id, 'bg'),
    color: v(id, 'text'),
    border: `${v(id, 'borderWidth')} solid ${v(id, 'border')}`,
    borderRadius: v(id, 'radius'),
    padding: `${v(id, 'paddingY')} ${v(id, 'paddingX')}`,
    ...ty(`${id}-textStyle`),
    '--hb': v(id, 'hoverBg'),
    '--ht': v(id, 'hoverText'),
    '--hbo': v(id, 'hoverBorder'),
    '--pb': v(id, 'pressedBg'),
    '--db': v(id, 'disabledBg'),
    '--dt': v(id, 'disabledText'),
  } as CSSProperties
  return (
    <button type="button" className={`ds-btn${state ? ` ds-btn--${state}` : ''}`} style={style} disabled={state === 'disabled'} {...hintAttrs(hint)}>
      {label ?? text}
    </button>
  )
}

export type PillId = 'pillNeutral' | 'pillSuccess' | 'pillWarning' | 'pillDanger'

export function DsPill({ id, label, hint }: { id: PillId; label?: string; hint?: Hint }) {
  const text = useLabel(id)
  return (
    <span
      className="ds-pill"
      style={{
        background: v(id, 'bg'),
        color: v(id, 'text'),
        border: `${v(id, 'borderWidth')} solid ${v(id, 'border')}`,
        borderRadius: v(id, 'radius'),
        padding: `${v(id, 'paddingY')} ${v(id, 'paddingX')}`,
        ...ty(`${id}-textStyle`),
      }}
      {...hintAttrs(hint)}
    >
      {label ?? text}
    </span>
  )
}

export function DsLink({ children, hint }: { children: ReactNode; hint?: Hint }) {
  const p = useContext(PaletteCtx)
  const underline = p ? String(getField(p, 'link', 'underline')) : 'hover'
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={`ds-link ds-link--${underline}`}
      style={{ ...ty('link-textStyle'), color: v('link', 'color'), '--lh': v('link', 'hoverColor') } as CSSProperties}
      {...hintAttrs(hint)}
    >
      {children}
    </a>
  )
}

/** Form field sample: label (with required star), input and dropdown, styled by the Form field component. */
export function DsFieldSample() {
  return (
    <div className="ds-field-sample">
      <label className="ds-field">
        <span className="ds-field-label">
          First name <span className="ds-required">*</span>
        </span>
        <input className="ds-input" placeholder="E.g. John" />
      </label>
      <label className="ds-field">
        <span className="ds-field-label">Prefix</span>
        <select className="ds-input" defaultValue="Mr.">
          <option>Mr.</option>
          <option>Ms.</option>
        </select>
      </label>
      <label className="ds-field">
        <span className="ds-field-label">
          Email address <span className="ds-required">*</span>
        </span>
        <input className="ds-input ds-input--error" defaultValue="john@" />
        <span className="ds-field-error">Enter a valid email address</span>
      </label>
    </div>
  )
}

export function DsCard({ title, children, hint, titleHint }: { title?: ReactNode; children?: ReactNode; hint?: Hint; titleHint?: Hint }) {
  return (
    <div
      className="ds-card"
      style={{
        background: v('card', 'bg'),
        border: `${v('card', 'borderWidth')} solid ${v('card', 'border')}`,
        borderRadius: v('card', 'radius'),
        padding: v('card', 'padding'),
        boxShadow: v('card', 'shadow'),
        color: v('card', 'text'),
      }}
      {...hintAttrs(hint)}
    >
      {title && (
        <div style={{ ...ty('card-textStyle'), color: v('card', 'title') }} {...hintAttrs(titleHint)}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

export function DsSection({ children, hint, className }: { children: ReactNode; hint?: Hint; className?: string }) {
  return (
    <div
      className={`ds-section ${className ?? ''}`}
      style={{
        background: v('section', 'bg'),
        border: `${v('section', 'borderWidth')} solid ${v('section', 'border')}`,
        borderRadius: v('section', 'radius'),
        padding: v('section', 'padding'),
      }}
      {...hintAttrs(hint)}
    >
      {children}
    </div>
  )
}

export function DsDarkBand({ hint, numberHint, textHint, activeHint, radius }: { hint?: Hint; numberHint?: Hint; textHint?: Hint; activeHint?: Hint; radius?: string }) {
  const num = useLabel('darkBand', 'number')
  const label = useLabel('darkBand', 'label')
  return (
    <div className="ds-band" style={{ background: v('darkBand', 'bg'), padding: v('darkBand', 'padding'), borderRadius: radius }} {...hintAttrs(hint)}>
      <span style={{ ...ty('darkBand-numberStyle'), color: v('darkBand', 'number') }} {...hintAttrs(numberHint)}>
        {num}
      </span>
      <span style={{ ...ty('darkBand-textStyle'), color: v('darkBand', 'text') }} {...hintAttrs(textHint)}>
        {label}
      </span>
      <span
        className="ds-band-active"
        style={{ background: v('darkBand', 'activeBg'), color: v('darkBand', 'activeText'), borderRadius: v('darkBand', 'activeRadius'), ...ty('ty-button') }}
        {...hintAttrs(activeHint)}
      >
        Active nav
      </span>
    </div>
  )
}

const MENU = ['Dashboard', 'Members', 'Bookings', 'Reports', 'Settings']

export function SidebarMock({ title = 'Club Management', selected = 1, hovered = 2, compact }: { title?: string; selected?: number; hovered?: number; compact?: boolean }) {
  const s = (k: string) => v('sidebar', k)
  return (
    <div className={compact ? 'sb-mock sb-mock--compact' : 'sb-mock'} style={{ background: s('bg') }}>
      <div className="sb-head" style={{ borderBottom: `1px solid ${s('divider')}` }}>
        <div style={{ ...ty('ty-h3'), color: s('title') }}>{title}</div>
        <div style={{ ...ty('ty-caption'), color: s('smallText') }}>Admin portal</div>
      </div>
      <nav className="sb-menu">
        {MENU.map((m, i) => (
          <div
            key={m}
            className="sb-item"
            style={{
              background: i === selected ? s('selected') : i === hovered ? s('hover') : 'transparent',
              color: i === selected ? s('selectedText') : s('menuText'),
              ...ty('ty-p1'),
              fontWeight: i === selected ? 700 : undefined,
            }}
          >
            <span className="sb-dot" style={{ background: i === selected ? s('selectedDot') : s('dot') }} />
            {m}
            <span className="sb-arrow" style={{ color: s('smallText') }}>›</span>
          </div>
        ))}
      </nav>
      <div className="sb-foot" style={{ borderTop: `1px solid ${s('divider')}`, color: s('smallText'), ...ty('ty-caption') }}>
        Logged in as <strong style={{ color: s('title') }}>Alex Chen</strong>
      </div>
    </div>
  )
}
