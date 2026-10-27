import { ColorField } from '../brand/ComponentsTab'
import { SectionTitle } from '../brand/shared'
import { NumberField, ToggleBtn, WEIGHT_NAMES } from '../brand/TypographyTab'
import { Icon } from '../components/Icon'
import { fieldDef } from '../data/components'
import { COLOR_DEFS, LAYOUT_DEFS, ROW_DEFS, type LookKind } from '../data/menus'
import { FONTS, fontWeights } from '../lib/fonts'
import { mergedStyle } from '../lib/menuTheme'
import { findRow, getField, resolveColor, textStyleCss } from '../lib/theme'
import { useApplied } from '../store/BrandStore'
import type { BarVersion, ColorRef, MenuLook, MenuText } from '../types'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Size, Text & spacing (laid out like Typography) and Colours of one menu area / version. */
export function LookEditor({
  kind, version = 'light', look, onChange, parts = ['size', 'text', 'colors'],
}: {
  kind: LookKind
  version?: BarVersion
  look: MenuLook
  onChange: (l: MenuLook) => void
  /** Which sections to show – the top bar splits shared size/text from per-version colours. */
  parts?: ('size' | 'text' | 'colors')[]
}) {
  return (
    <>
      {parts.includes('size') && (
        <>
          <SectionTitle>Size</SectionTitle>
          <LayoutFields kind={kind} look={look} onChange={onChange} />
        </>
      )}
      {parts.includes('text') && (
        <>
          <SectionTitle>Text & spacing</SectionTitle>
          <TextTable kind={kind} look={look} onChange={onChange} />
        </>
      )}
      {parts.includes('colors') && (
        <>
          <SectionTitle>Colours</SectionTitle>
          <ColorRows kind={kind} version={version} look={look} onChange={onChange} />
        </>
      )}
    </>
  )
}

function LayoutFields({ kind, look, onChange }: { kind: LookKind; look: MenuLook; onChange: (l: MenuLook) => void }) {
  return (
    <div className="menu-fields">
      {LAYOUT_DEFS[kind].map((l) => {
        const value = look.layout[l.key] ?? l.def
        const set = (n: number) => onChange({ ...look, layout: { ...look.layout, [l.key]: n } })
        return (
          <div key={l.key} className="field-row">
            <div className="field-label">
              <span>{l.label}</span>
              <small>{l.desc}</small>
            </div>
            <div className="field-control">
              <span className="num-unit">
                <NumberField value={value} min={l.min} max={l.max} onChange={(n) => n != null && set(n)} ariaLabel={l.label} />
                px
              </span>
              <button className="icon-btn" title={`Reset to ${l.def}`} onClick={() => set(l.def)} style={{ visibility: value !== l.def ? 'visible' : 'hidden' }}>
                <Icon name="reset" size={14} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TextTable({ kind, look, onChange }: { kind: LookKind; look: MenuLook; onChange: (l: MenuLook) => void }) {
  const typo = useApplied('typography')
  return (
    <div className="type-table-wrap">
      <table className="type-table menu-table">
        <thead>
          <tr>
            <th>Text name</th>
            <th>Text style</th>
            <th>Size (px)</th>
            <th>Font</th>
            <th>Style</th>
            <th>Spacing (px)</th>
            <th>Sample</th>
            <th aria-label="Reset" />
          </tr>
        </thead>
        <tbody>
          {ROW_DEFS[kind].map((r) => {
            const t = look.rows[r.id] ?? r.def
            const base = findRow(typo, t.style)
            const merged = mergedStyle(t, typo)
            const set = (patch: Partial<MenuText>) => onChange({ ...look, rows: { ...look.rows, [r.id]: { ...t, ...patch } } })
            return (
              <tr key={r.id}>
                <td className="cell-name">
                  <div className="menu-row-name">{r.name}</div>
                  <div className="menu-row-desc">{r.description}</div>
                </td>
                <td>
                  <select className="ui-input" value={t.style} onChange={(e) => set({ style: e.target.value })} aria-label="Text style" title="Typography text style this follows">
                    {typo.rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <NumberField value={t.size} placeholder={String(base.size)} min={6} max={120} allowEmpty onChange={(size) => set({ size })} ariaLabel="Size in px" />
                </td>
                <td className="cell-font">
                  <select className="ui-input" value={t.font ?? ''} onChange={(e) => set({ font: e.target.value || null })} aria-label="Font">
                    <option value="">{base.font} (text style)</option>
                    {(['sans', 'serif', 'display', 'mono'] as const).map((cat) => (
                      <optgroup key={cat} label={{ sans: 'Sans serif', serif: 'Serif', display: 'Display', mono: 'Monospace' }[cat]}>
                        {FONTS.filter((f) => f.category === cat).map((f) => (
                          <option key={f.name} value={f.name}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="style-tools">
                    <select className="ui-input weight-select" value={t.weight ?? ''} onChange={(e) => set({ weight: e.target.value ? Number(e.target.value) : null })} aria-label="Weight">
                      <option value="">{base.weight} (text style)</option>
                      {fontWeights(merged.font).map((w) => (
                        <option key={w} value={w}>
                          {w} · {WEIGHT_NAMES[w] ?? ''}
                        </option>
                      ))}
                    </select>
                    <ToggleBtn on={merged.uppercase} onClick={() => set({ uppercase: !merged.uppercase })} title="Uppercase">
                      <span style={{ fontSize: 11, fontWeight: 700 }}>AA</span>
                    </ToggleBtn>
                  </div>
                </td>
                <td>
                  {r.spacing.length ? (
                    <div className="spacing-list">
                      {r.spacing.map((s) => (
                        <label key={s.key} className="spacing-field">
                          <span>{s.label}</span>
                          <NumberField value={t[s.key]} min={0} max={s.max} onChange={(n) => set({ [s.key]: n ?? 0 })} ariaLabel={s.label} small />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <span className="muted small">Set under Size</span>
                  )}
                </td>
                <td className="cell-sample">
                  <span className="menu-sample" style={textStyleCss(merged)}>
                    {r.sample}
                  </span>
                </td>
                <td className="cell-del">
                  <button className="icon-btn" title="Reset to default" disabled={same(t, r.def)} onClick={() => set(r.def)}>
                    <Icon name="reset" size={15} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ColorRows({ kind, version, look, onChange }: { kind: LookKind; version: BarVersion; look: MenuLook; onChange: (l: MenuLook) => void }) {
  const palette = useApplied('palettes')
  return (
    <div className="menu-fields">
      {COLOR_DEFS[kind].map((cd) => {
        const def = version === 'dark' ? cd.dark ?? cd.light : cd.light
        const value = cd.key in look.colors ? look.colors[cd.key] : def
        const set = (v: ColorRef | null) => onChange({ ...look, colors: { ...look.colors, [cd.key]: v } })
        const linked = cd.link ? (getField(palette, 'sidebar', cd.link) as ColorRef) : null
        return (
          <div key={cd.key} className="field-row">
            <div className="field-label">
              <span>{cd.label}</span>
              <small>{cd.desc}</small>
            </div>
            <div className="field-control">
              {value === null && linked ? (
                <>
                  <span className="linked-color">
                    <span className="color-chip color-chip--sm" style={{ '--chip': resolveColor(linked, palette.tokens) } as React.CSSProperties} />
                    Same as Components › Sidebar › {fieldDef('sidebar', cd.link!)?.label}
                  </span>
                  <button className="ui-btn ui-btn--small" onClick={() => set(structuredClone(linked))}>
                    Customise
                  </button>
                </>
              ) : (
                <>
                  <ColorField value={value ?? { token: 'dark', alpha: 100 }} tokens={palette.tokens} onChange={set} />
                  {cd.link ? (
                    <button className="ui-btn ui-btn--small" title="Follow Components › Sidebar again" onClick={() => set(null)}>
                      <Icon name="link" size={13} /> Link to sidebar
                    </button>
                  ) : (
                    <button className="icon-btn" title="Reset to default" onClick={() => set(def)} style={{ visibility: same(value, def) ? 'hidden' : 'visible' }}>
                      <Icon name="reset" size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
