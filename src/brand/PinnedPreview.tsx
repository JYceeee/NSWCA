import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { COMPONENT_MAP } from '../data/components'
import { getField, ty } from '../lib/theme'
import { useApplied, useBrand, useSelected, type PreviewMode } from '../store/BrandStore'
import type { BrandTab, ColorRef, Palette } from '../types'
import { DsButton, DsCard, DsDarkBand, DsLink, DsPill, DsSection, ThemeScope, type Hint } from './ds'

/** "Primary button|Background → primary|Text → on-primary" – first part is the title. */
function compHint(p: Palette, cid: string, keys?: string[]): Hint {
  const def = COMPONENT_MAP[cid]
  const fields = def.groups.flatMap((g) =>
    g.fields
      .filter((f) => f.type === 'color' && (!keys || keys.includes(f.key)))
      .map((f) => ({ f, label: g.label && !['Default', 'Colours'].includes(g.label) ? `${g.label} ${f.label.toLowerCase()}` : f.label })),
  )
  const lines = fields.slice(0, 6).map(({ f, label }) => {
    const r = getField(p, cid, f.key) as ColorRef
    const name = r.token ?? r.hex
    return `${label} → ${name}${r.alpha < 100 ? ` (${r.alpha}%)` : ''}`
  })
  return { tokens: [def.name, ...lines].join('|'), target: `component:${cid}` }
}

const typeHint = (rowName: string, rowId: string, colorToken: string): Hint => ({
  tokens: `${rowName}|Text style → ${rowName}|Colour → ${colorToken}`,
  target: `textStyle:${rowId}`,
})

export function PinnedPreview() {
  const { ui, setUi, focusOn } = useBrand()
  const selPalette = useSelected('palettes')
  const selTypo = useSelected('typography')
  const appliedPalette = useApplied('palettes')
  const appliedTypo = useApplied('typography')
  const palette = ui.tab === 'palette' || ui.tab === 'components' ? selPalette : appliedPalette
  const typo = ui.tab === 'typography' ? selTypo : appliedTypo
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hide = () => setTip(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [])

  const onMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tokens]')
    if (!el || !box.current?.contains(el)) return setTip(null)
    setTip({ x: e.clientX, y: e.clientY, lines: el.dataset.tokens!.split('|') })
  }

  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-target]')
    if (!el?.dataset.target) return
    e.preventDefault()
    const [kind, id] = el.dataset.target.split(':') as ['component' | 'textStyle' | 'token', string]
    const tab: BrandTab = kind === 'component' ? 'components' : kind === 'textStyle' ? 'typography' : 'palette'
    focusOn(kind, id, tab)
  }

  const source = ui.tab === 'palette' || ui.tab === 'components' ? `${palette.name} (editing)` : palette.name
  const typoSource = ui.tab === 'typography' ? `${typo.name} (editing)` : typo.name

  const bt = (cid: string) => compHint(palette, cid)
  const heading = (id: string, name: string, color: string, style: CSSProperties = {}) => ({
    style: { ...ty(`ty-${id}`), color: `var(--t-${color})`, margin: 0, ...style },
    ...(() => {
      const h = typeHint(name, id, color)
      return { 'data-tokens': h.tokens, 'data-target': h.target }
    })(),
  })

  return (
    <div className={`pinned pinned--${ui.previewMode}`}>
      <div className="pinned-bar">
        <strong>Live preview</strong>
        <span className="pinned-source">
          <span className="dot" style={{ background: palette.tokens.primary }} /> {source} · {typoSource}
        </span>
        <span className="pinned-hint">Hover to see tokens · click to edit</span>
        <ViewModeMenu value={ui.previewMode} onChange={(previewMode) => setUi({ previewMode })} />
      </div>
      {ui.previewMode !== 'hidden' && (
        <>
          <div className="pinned-scroll" ref={box} onMouseMove={onMove} onMouseLeave={() => setTip(null)} onClick={onClick}>
            <ThemeScope palette={palette} typo={typo} className="pv-page" data-tokens="Page background|Background → bg" data-target="token:bg">
              <div className="pv-hero">
                <h1 {...heading('h1', 'Heading 1', 'heading')}>Setting the Standard</h1>
                <p {...heading('p1', 'Paragraph 1', 'text')}>
                  Paragraph text{' '}
                  <span style={{ color: 'var(--t-muted)' }} data-tokens="Muted caption|Colour → muted" data-target="token:muted">
                    and muted captions.
                  </span>{' '}
                  <DsLink hint={bt('link')}>A link to somewhere →</DsLink>
                </p>
                <div className="pv-buttons">
                  <DsButton id="btnPrimary" hint={bt('btnPrimary')} />
                  <DsButton id="btnSecondary" hint={bt('btnSecondary')} />
                  <DsButton id="btnSoft" hint={bt('btnSoft')} />
                  <DsButton id="btnDanger" hint={bt('btnDanger')} />
                </div>
              </div>

              <DsSection hint={bt('section')} className="pv-section">
                <div className="pv-cards">
                  <DsCard title="Card title" hint={bt('card')} titleHint={{ ...bt('card'), target: 'component:card' }}>
                    <div className="pill-row">
                      <DsPill id="pillNeutral" hint={bt('pillNeutral')} />
                      <DsPill id="pillSuccess" hint={bt('pillSuccess')} />
                      <DsPill id="pillWarning" hint={bt('pillWarning')} />
                      <DsPill id="pillDanger" hint={bt('pillDanger')} />
                    </div>
                    <p {...heading('caption', 'Caption', 'muted', { marginTop: 10 })}>Updated 2 hours ago</p>
                  </DsCard>
                  <DsCard hint={bt('card')}>
                    <div className="pv-rank">
                      <span style={{ ...ty('ty-cardNumber'), color: 'var(--card-number)' }} data-tokens={compHint(palette, 'card', ['number']).tokens} data-target="component:card">#3</span>
                      <span {...heading('cardText', 'Card text', 'heading')}>Club ranking</span>
                    </div>
                    <p {...heading('caption', 'Caption', 'muted', { marginTop: 8 })}>Up 2 places this season</p>
                  </DsCard>
                  <DsCard hint={bt('card')}>
                    <div {...heading('stat', 'Stat number', 'heading')}>$12,480</div>
                    <div className="pv-bars" data-tokens="Chart|Series 1 → chart-1|Series 2 → chart-2" data-target="token:chart-1">
                      {[40, 65, 50, 80, 60, 92].map((h, i) => (
                        <span key={i} style={{ height: `${h}%`, background: i % 2 ? 'var(--t-chart-2)' : 'var(--t-chart-1)' }} />
                      ))}
                    </div>
                    <div className="pv-table-row" style={{ borderTop: '1px solid var(--t-border-light)' }}>
                      <span {...heading('table', 'Table content', 'text')}>Alex Chen</span>
                      <span {...heading('table', 'Table content', 'text')}>$120.00</span>
                    </div>
                  </DsCard>
                </div>
              </DsSection>

              <DsDarkBand
                hint={compHint(palette, 'darkBand', ['bg'])}
                numberHint={compHint(palette, 'darkBand', ['number'])}
                textHint={compHint(palette, 'darkBand', ['text'])}
                activeHint={compHint(palette, 'darkBand', ['activeBg', 'activeText'])}
                radius="12px"
              />
            </ThemeScope>
          </div>
        </>
      )}
      {tip && (
        <div className="token-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 260), top: tip.y + 16 }}>
          <strong>{tip.lines[0]}</strong>
          {tip.lines.slice(1).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}

const MODES: { value: PreviewMode; label: string }[] = [
  { value: 'full', label: 'Full height' },
  { value: 'compact', label: '300px' },
  { value: 'small', label: '150px' },
  { value: 'hidden', label: 'Hidden' },
]

function ViewModeMenu({ value, onChange }: { value: PreviewMode; onChange: (m: PreviewMode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="view-menu" ref={ref}>
      <button className="ui-btn ui-btn--small" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        {MODES.find((m) => m.value === value)?.label}
        <span className={open ? 'caret caret--up' : 'caret'}>
          <Icon name="chevronDown" size={14} />
        </span>
      </button>
      {open && (
        <div className="view-menu-list" role="menu">
          {MODES.map((m) => (
            <button
              key={m.value}
              role="menuitemradio"
              aria-checked={m.value === value}
              className="view-menu-item"
              onClick={() => {
                onChange(m.value)
                setOpen(false)
              }}
            >
              <span className="view-menu-check">{m.value === value && <Icon name="check" size={14} />}</span>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
