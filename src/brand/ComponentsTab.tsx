import { useEffect, useState } from 'react'
import { ColorPicker } from '../components/ColorPicker'
import { Icon } from '../components/Icon'
import { useDialogs } from '../components/Dialogs'
import { COMPONENTS, type ComponentDef, type FieldDef } from '../data/components'
import { TOKEN_GROUPS, type TokenKey } from '../data/tokens'
import { normalizeHex, toCss } from '../lib/color'
import { fieldDefault, getField, refHex } from '../lib/theme'
import { useApplied, useBrand, useSelected } from '../store/BrandStore'
import type { ColorRef, FieldValue, Palette } from '../types'
import { DsButton, DsCard, DsDarkBand, DsFieldSample, DsLink, DsPill, DsSection, SidebarMock, ThemeScope, type ButtonId, type PillId } from './ds'
import { duplicatePalette, PaletteSwitcher } from './PaletteTab'
import { NewItemDialog, SaveBar } from './shared'
import { NumberField } from './TypographyTab'

export function ComponentsTab() {
  const palette = useSelected('palettes')
  const typo = useApplied('typography')
  const { update, focus } = useBrand()
  const { confirm } = useDialogs()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [newFrom, setNewFrom] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (focus?.kind !== 'component') return
    setExpanded((s) => new Set(s).add(focus.id))
    setFlash(focus.id)
    setTimeout(() => document.getElementById(`comp-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [focus])

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const setField = (cid: string, key: string, value: FieldValue) =>
    update('palettes', palette.id, (p) => ({ ...p, components: { ...p.components, [cid]: { ...p.components[cid], [key]: value } } }))

  const resetField = (cid: string, key: string) => setField(cid, key, fieldDefault(palette, cid, key))

  const resetComponent = async (c: ComponentDef) => {
    const ok = await confirm({ title: `Reset ${c.name}?`, message: `All ${c.name.toLowerCase()} settings for ${palette.name} go back to their defaults.`, confirmLabel: 'Reset', danger: true })
    if (!ok) return
    update('palettes', palette.id, (p) => {
      const components = { ...p.components }
      if (p.componentDefaults[c.id]) components[c.id] = structuredClone(p.componentDefaults[c.id])
      else delete components[c.id]
      return { ...p, components }
    })
  }

  return (
    <div className="tab-body">
      <PaletteSwitcher onNew={() => setNewFrom(palette.id)} />
      <div className="comp-intro">
        <p>
          Editing components of <strong>{palette.name}</strong>. Each palette keeps its own component settings. Colours follow a palette token unless you pick
          a custom colour.
        </p>
        <div className="comp-intro-actions">
          <button className="ui-btn" onClick={() => setExpanded(new Set(COMPONENTS.map((c) => c.id)))}>Expand all</button>
          <button className="ui-btn" onClick={() => setExpanded(new Set())}>Collapse all</button>
        </div>
      </div>
      <ThemeScope palette={palette} typo={typo} className="comp-list">
        {COMPONENTS.map((c) => {
          const open = expanded.has(c.id)
          return (
            <section key={c.id} id={`comp-${c.id}`} className={['comp', open && 'comp--open', flash === c.id && 'comp--flash'].filter(Boolean).join(' ')}>
              <div className="comp-head" onClick={() => toggle(c.id)} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(c.id)} aria-expanded={open}>
                <span className="comp-caret">
                  <Icon name={open ? 'chevronDown' : 'chevron'} size={14} />
                </span>
                <strong>{c.name}</strong>
                <span className="comp-desc">{c.description}</span>
                <span className="comp-sample" onClick={(e) => e.stopPropagation()}>
                  <Sample c={c} small />
                </span>
              </div>
              {open && (
                <div className="comp-body">
                  <div className="comp-fields">
                    {c.groups.map((g, gi) => (
                      <div key={gi} className="field-group">
                        {g.label && <div className="field-group-label">{g.label}</div>}
                        {g.fields.map((f) => (
                          <FieldRow
                            key={f.key}
                            f={f}
                            palette={palette}
                            typoRows={typo.rows}
                            value={getField(palette, c.id, f.key)}
                            def={fieldDefault(palette, c.id, f.key)}
                            onChange={(val) => setField(c.id, f.key, val)}
                            onReset={() => resetField(c.id, f.key)}
                          />
                        ))}
                      </div>
                    ))}
                    <button className="ui-btn" onClick={() => resetComponent(c)}>
                      <Icon name="reset" size={14} /> Reset {c.name.toLowerCase()}
                    </button>
                  </div>
                  <div className="comp-live">
                    <div className="comp-live-label">Live sample</div>
                    <div className="comp-live-stage" style={{ background: 'var(--t-bg)' }}>
                      <Sample c={c} />
                    </div>
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </ThemeScope>
      <SaveBar slice="palettes" item={palette} />
      {newFrom && <NewItemDialog slice="palettes" sourceId={newFrom} onClose={() => setNewFrom(null)} make={duplicatePalette} />}
    </div>
  )
}

function Sample({ c, small }: { c: ComponentDef; small?: boolean }) {
  switch (c.kind) {
    case 'button':
      return small ? (
        <DsButton id={c.id as ButtonId} />
      ) : (
        <div className="state-grid">
          {(['default', 'hover', 'pressed', 'disabled'] as const).map((s) => (
            <div key={s} className="state-cell">
              <DsButton id={c.id as ButtonId} state={s === 'default' ? undefined : s} />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )
    case 'pill':
      return <DsPill id={c.id as PillId} />
    case 'card':
      return small ? (
        <span className="mini-card" style={{ background: 'var(--card-bg)', border: 'var(--card-borderWidth) solid var(--card-border)', borderRadius: 'var(--card-radius)' }} />
      ) : (
        <DsCard title="Card title">
          <p style={{ margin: '6px 0 0', fontSize: 14 }}>Body text inside a card.</p>
        </DsCard>
      )
    case 'section':
      return small ? (
        <span className="mini-card" style={{ background: 'var(--section-bg)', border: 'var(--section-borderWidth) solid var(--section-border)', borderRadius: 'var(--section-radius)' }} />
      ) : (
        <DsSection>
          <div className="pill-row">
            <DsPill id="pillNeutral" />
            <DsPill id="pillSuccess" />
          </div>
        </DsSection>
      )
    case 'darkBand':
      return small ? <span className="mini-card" style={{ background: 'var(--darkBand-bg)' }} /> : <DsDarkBand radius="10px" />
    case 'link':
      return <DsLink>A link to somewhere</DsLink>
    case 'sidebar':
      return small ? <span className="mini-card" style={{ background: 'var(--sidebar-bg)' }} /> : <SidebarMock />
    case 'formField':
      return small ? (
        <span className="mini-card" style={{ background: 'var(--formField-inputBg)', border: 'var(--formField-selectBorderWidth) solid var(--formField-selectBorder)', borderRadius: 'var(--formField-radius)' }} />
      ) : (
        <DsFieldSample />
      )
  }
}

interface FieldRowProps {
  f: FieldDef
  palette: Palette
  typoRows: { id: string; name: string }[]
  value: FieldValue
  def: FieldValue
  onChange: (v: FieldValue) => void
  onReset: () => void
}

function FieldRow({ f, palette, typoRows, value, def, onChange, onReset }: FieldRowProps) {
  const changed = JSON.stringify(value) !== JSON.stringify(def)
  let control: React.ReactNode
  switch (f.type) {
    case 'color':
      control = <ColorField value={value as ColorRef} tokens={palette.tokens} onChange={onChange} />
      break
    case 'number':
      control = (
        <span className="num-unit">
          <NumberField value={value as number} min={f.min ?? 0} max={f.max ?? 999} onChange={(n) => onChange(n ?? 0)} ariaLabel={f.label} />
          {f.unit}
        </span>
      )
      break
    case 'optNumber':
      control = (
        <span className="num-unit">
          <NumberField value={value as number | null} min={f.min ?? 0} max={f.max ?? 999} onChange={onChange} allowEmpty placeholder="—" ariaLabel={f.label} />
          {f.unit}
        </span>
      )
      break
    case 'textStyle':
      control = (
        <select className="ui-input" value={value as string} onChange={(e) => onChange(e.target.value)}>
          {typoRows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )
      break
    case 'select':
      control = (
        <select className="ui-input" value={value as string} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
      break
    case 'text':
      control = <input className="ui-input" value={value as string} onChange={(e) => onChange(e.target.value)} />
      break
  }
  return (
    <div className="field-row">
      <div className="field-label">
        <span>{f.label}</span>
        {f.desc && <small>{f.desc}</small>}
      </div>
      <div className="field-control">
        {control}
        <button className="icon-btn" title="Reset to default" onClick={onReset} style={{ visibility: changed ? 'visible' : 'hidden' }}>
          <Icon name="reset" size={14} />
        </button>
      </div>
    </div>
  )
}

const CUSTOM = '__custom'

export function ColorField({ value, tokens, onChange }: { value: ColorRef; tokens: Palette['tokens']; onChange: (v: ColorRef) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const hex = refHex(value, tokens)
  const [text, setText] = useState(hex)
  useEffect(() => setText(hex), [hex])

  const commitHex = (h: string) => {
    const n = normalizeHex(h)
    if (!n) return setText(hex)
    // An 8-digit hex carries its own opacity.
    if (n.length === 9) onChange({ hex: n.slice(0, 7), alpha: Math.round((parseInt(n.slice(7), 16) / 255) * 100) })
    else onChange({ hex: n, alpha: value.alpha })
  }

  return (
    <div className="color-field">
      <button
        className="color-chip"
        style={{ '--chip': toCss(hex, value.alpha) } as React.CSSProperties}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        aria-label="Pick a custom colour"
      />
      <select
        className="ui-input token-select"
        value={value.token ?? CUSTOM}
        onChange={(e) => (e.target.value === CUSTOM ? onChange({ hex, alpha: value.alpha }) : onChange({ token: e.target.value as TokenKey, alpha: value.alpha }))}
        title="Palette token"
      >
        <option value={CUSTOM}>Custom colour</option>
        {TOKEN_GROUPS.map((g) => (
          <optgroup key={g.id} label={g.label}>
            {g.tokens.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        className="ui-input hex-input"
        value={text}
        disabled={!!value.token}
        title={value.token ? 'Linked to a palette token – choose “Custom colour” to type a value' : 'Hex colour'}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commitHex(text)}
        onKeyDown={(e) => e.key === 'Enter' && commitHex(text)}
        spellCheck={false}
      />
      <label className="opacity">
        <span>Opacity</span>
        <input type="range" min={0} max={100} value={value.alpha} onChange={(e) => onChange({ ...value, alpha: Number(e.target.value) })} />
        <span className="opacity-val">{value.alpha}%</span>
      </label>
      {anchor && <ColorPicker anchor={anchor} value={hex} onChange={(h) => onChange({ hex: h, alpha: value.alpha })} onClose={() => setAnchor(null)} />}
    </div>
  )
}
