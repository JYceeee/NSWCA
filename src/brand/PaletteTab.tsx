import { useEffect, useRef, useState } from 'react'
import { ColorPicker } from '../components/ColorPicker'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { DERIVED, TOKEN_GROUPS, type TokenKey } from '../data/tokens'
import { deriveHover, deriveTint } from '../lib/color'
import { paletteCss } from '../lib/theme'
import { useApplied, useBrand, useSelected } from '../store/BrandStore'
import type { Palette } from '../types'
import { ItemHeader, ItemSwitcher, NewItemDialog, SaveBar, SectionTitle } from './shared'

export function duplicatePalette(src: Palette, id: string, name: string): Palette {
  return { ...src, id, name, builtin: false, defaults: { ...src.tokens }, componentDefaults: structuredClone(src.components) }
}

export function PaletteSwitcher({ onNew }: { onNew: () => void }) {
  return <ItemSwitcher slice="palettes" onNew={onNew} dot={(p) => <span className="dot" style={{ background: (p as Palette).tokens.primary }} />} />
}

export function PaletteTab() {
  const palette = useSelected('palettes')
  const typo = useApplied('typography')
  const { update, focus } = useBrand()
  const [newFrom, setNewFrom] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [open, setOpen] = useState<{ key: TokenKey; el: HTMLElement } | null>(null)
  const [autoDerive, setAutoDerive] = useState(true)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (focus?.kind !== 'token') return
    setFlash(focus.id)
    document.getElementById(`swatch-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [focus])

  const setToken = (key: TokenKey, hex: string) =>
    update('palettes', palette.id, (p) => {
      const tokens = { ...p.tokens, [key]: hex }
      const d = DERIVED[key]
      if (d && autoDerive) {
        tokens[d.hover] = deriveHover(hex)
        tokens[d.tint] = deriveTint(hex)
      }
      return { ...p, tokens }
    })

  const undoToken = (key: TokenKey) => update('palettes', palette.id, (p) => ({ ...p, tokens: { ...p.tokens, [key]: p.defaults[key] } }))

  return (
    <div className="tab-body">
      <PaletteSwitcher onNew={() => setNewFrom(palette.id)} />
      <div className="panel">
        <ItemHeader
          slice="palettes"
          item={palette}
          onDuplicate={() => setNewFrom(palette.id)}
          extra={
            <button className="ui-btn" onClick={() => setExporting(true)}>
              <Icon name="code" size={15} /> Export CSS
            </button>
          }
        />
        {TOKEN_GROUPS.map((g) => (
          <section key={g.id} className="token-group">
            <SectionTitle>{g.label}</SectionTitle>
            <div className="swatch-grid">
              {g.tokens.map((k) => {
                const changed = palette.tokens[k].toUpperCase() !== palette.defaults[k].toUpperCase()
                return (
                  <div key={k} id={`swatch-${k}`} className={flash === k ? 'swatch swatch--flash' : 'swatch'}>
                    <button
                      className={open?.key === k ? 'swatch-chip swatch-chip--open' : 'swatch-chip'}
                      style={{ background: palette.tokens[k] }}
                      aria-label={`Edit ${k}`}
                      onClick={(e) => setOpen(open?.key === k ? null : { key: k, el: e.currentTarget })}
                    />
                    <div className="swatch-meta">
                      <strong>{k}</strong>
                      <code>{palette.tokens[k]}</code>
                    </div>
                    {changed && (
                      <button className="icon-btn swatch-undo" title={`Undo – back to ${palette.defaults[k]}`} onClick={() => undoToken(k)}>
                        <Icon name="reset" size={14} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
      <SaveBar slice="palettes" item={palette} />

      {open && (
        <ColorPicker
          anchor={open.el}
          value={palette.tokens[open.key]}
          onChange={(hex) => setToken(open.key, hex)}
          onClose={() => setOpen(null)}
          footer={
            DERIVED[open.key] && (
              <label className="check">
                <input type="checkbox" checked={autoDerive} onChange={(e) => setAutoDerive(e.target.checked)} />
                Also update {DERIVED[open.key]!.hover} &amp; {DERIVED[open.key]!.tint}
              </label>
            )
          }
        />
      )}
      {newFrom && <NewItemDialog slice="palettes" sourceId={newFrom} onClose={() => setNewFrom(null)} make={duplicatePalette} />}
      {exporting && <ExportDialog css={paletteCss(palette, typo)} name={palette.name} onClose={() => setExporting(false)} />}
    </div>
  )
}

function ExportDialog({ css, name, onClose }: { css: string; name: string; onClose: () => void }) {
  const { toast } = useDialogs()
  const area = useRef<HTMLTextAreaElement>(null)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(css)
    } catch {
      area.current?.select()
      document.execCommand('copy')
    }
    toast('CSS copied to clipboard')
  }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([css], { type: 'text/css' }))
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.css`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <Modal title={`Export “${name}” as CSS variables`} onClose={onClose} width={640}>
      <div className="modal-body">
        <p className="muted">Includes the colours shown here (unsaved edits too), plus every component colour resolved to a value.</p>
        <textarea ref={area} className="code-area" readOnly value={css} />
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={download}>
          <Icon name="download" size={15} /> Download .css
        </button>
        <button className="ui-btn ui-btn--primary" onClick={copy}>
          <Icon name="copy" size={15} /> Copy
        </button>
      </div>
    </Modal>
  )
}
