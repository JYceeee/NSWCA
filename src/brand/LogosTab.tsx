import { useRef, useState } from 'react'
import { Icon } from '../components/Icon'
import { useDialogs } from '../components/Dialogs'
import { DEFAULT_TAB_TITLE, heightKey, LOGO_HEIGHTS, LOGO_SLOTS, logoHeight, svgDataUrl, tabTitle } from '../data/logos'
import { getAsset, putAsset } from '../lib/db'
import { uid, useApplied, useBrand, useSelected } from '../store/BrandStore'
import type { LogoSet, LogoSlot, LogoSlotKey } from '../types'
import { DsButton, ThemeScope } from './ds'
import { ItemHeader, ItemSwitcher, NewItemDialog, SaveBar, SectionTitle, useAssetUrl } from './shared'
import { NumberField } from './TypographyTab'

export function useSlotUrl(slot: LogoSlot | null) {
  const assetUrl = useAssetUrl(slot?.kind === 'asset' ? slot.assetId : null)
  if (!slot) return null
  return slot.kind === 'svg' ? svgDataUrl(slot.svg) : assetUrl
}

/** Renders a slot, falling back sensibly when it is empty. */
export function LogoImage({ set, slot, height, className }: { set: LogoSet; slot: LogoSlotKey; height: number; className?: string }) {
  const own = set.slots[slot]
  const fallbackKey: LogoSlotKey | null = !own ? (slot === 'reversed' ? 'primary' : slot === 'icon' ? null : 'reversed') : null
  const fallback = fallbackKey ? set.slots[fallbackKey] : null
  const url = useSlotUrl(own ?? fallback)
  if (!own && !fallback) {
    return (
      <span className={`logo-monogram ${className ?? ''}`} style={{ width: height, height, fontSize: height * 0.5 }}>
        {set.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  if (!url) return <span style={{ display: 'inline-block', height }} />
  // A stand-in from the other lockup is recoloured to suit the background.
  const style = own ? undefined : slot === 'reversed' ? { filter: 'brightness(0) invert(1)' } : { filter: 'brightness(0)' }
  return <img className={className} src={url} alt={`${set.name} logo`} style={{ height, width: 'auto', ...style }} />
}

export function LogosTab() {
  const set = useSelected('logos')
  const palette = useApplied('palettes')
  const typo = useApplied('typography')
  const { update } = useBrand()
  const { toast } = useDialogs()
  const [newFrom, setNewFrom] = useState<string | null>(null)

  const setSlot = (key: LogoSlotKey, slot: LogoSlot | null) => update('logos', set.id, (s) => ({ ...s, slots: { ...s.slots, [key]: slot } }))
  const setHeight = (key: LogoSlotKey, h: number) => update('logos', set.id, (s) => ({ ...s, heights: { ...s.heights, [heightKey(key)]: h } }))

  const upload = async (key: LogoSlotKey, file: File) => {
    if (!/^image\/(svg\+xml|png|webp|jpeg)$/.test(file.type)) return toast('Please upload an SVG or PNG file')
    const id = uid('asset')
    try {
      await putAsset({ id, name: file.name, type: file.type, blob: file })
    } catch (e) {
      return toast(e instanceof Error ? e.message : 'Could not upload the file')
    }
    setSlot(key, { kind: 'asset', assetId: id, name: file.name, mime: file.type })
  }

  const download = async (slot: LogoSlot) => {
    let blob: Blob
    if (slot.kind === 'svg') blob = new Blob([slot.svg], { type: 'image/svg+xml' })
    else {
      const a = await getAsset(slot.assetId)
      if (!a) return toast('File not found')
      blob = a.blob
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = slot.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }

  return (
    <div className="tab-body">
      <ItemSwitcher slice="logos" onNew={() => setNewFrom(set.id)} />
      <div className="panel">
        <ItemHeader slice="logos" item={set} onDuplicate={() => setNewFrom(set.id)} />
        <div className="logo-slots">
          {LOGO_SLOTS.map((s) => (
            <SlotCard key={s.key} set={set} slotKey={s.key} label={s.label} desc={s.desc} tokens={palette.tokens} onUpload={(f) => upload(s.key, f)} onClear={() => setSlot(s.key, null)} onDownload={download} onHeight={(h) => setHeight(s.key, h)} />
          ))}
        </div>

        <label className="tab-title-field">
          <span>
            Browser tab title
            <small>Shown next to the icon in the browser tab</small>
          </span>
          <input
            className="ui-input"
            value={set.tabTitle ?? ''}
            placeholder={DEFAULT_TAB_TITLE}
            onChange={(e) => update('logos', set.id, (s) => ({ ...s, tabTitle: e.target.value }))}
          />
        </label>

        <SectionTitle>Where it’s used</SectionTitle>
        <ThemeScope palette={palette} typo={typo} className="usage-grid">
          <figure className="usage usage--wide">
            <div className="usage-header" style={{ background: 'var(--t-card)', borderBottom: '1px solid var(--t-border)' }}>
              <LogoImage set={set} slot="primary" height={logoHeight(set, 'primary')} />
              <nav style={{ color: 'var(--t-text)', fontFamily: 'var(--ty-p1-font)' }}>
                <span>Home</span>
                <span>Membership</span>
                <span>Events</span>
                <span>Contact</span>
              </nav>
              <DsButton id="btnPrimary" label="Join now" />
            </div>
            <div className="usage-page" style={{ background: 'var(--t-bg)' }} />
            <figcaption>Site header · primary logo</figcaption>
          </figure>

          <figure className="usage usage--wide">
            <div className="usage-footer" style={{ background: 'var(--t-dark)', color: 'var(--t-on-dark)', fontFamily: 'var(--ty-p1-font)' }}>
              <div>
                <LogoImage set={set} slot="reversed" height={logoHeight(set, 'reversed')} />
                <p style={{ opacity: 0.7 }}>Setting the standard since 1999.</p>
              </div>
              <div className="usage-footer-cols">
                <div><strong>Club</strong><span>About</span><span>Coaches</span></div>
                <div><strong>Members</strong><span>Log in</span><span>Fees</span></div>
              </div>
            </div>
            <figcaption>Footer · reversed logo</figcaption>
          </figure>

          <figure className="usage">
            <div className="usage-browser">
              <div className="browser-tabs">
                <div className="browser-tab browser-tab--active">
                  <LogoImage set={set} slot="icon" height={16} className="favicon" />
                  <span>{tabTitle(set)}</span>
                  <Icon name="x" size={12} />
                </div>
                <div className="browser-tab">
                  <span className="favicon-blank" />
                  <span>New tab</span>
                </div>
              </div>
              <div className="browser-bar">
                <span className="browser-url">example.com</span>
              </div>
              <div className="browser-page" style={{ background: 'var(--t-bg)' }} />
            </div>
            <figcaption>Browser tab · favicon (icon)</figcaption>
          </figure>

          <figure className="usage">
            <div className="usage-phone" style={{ background: `linear-gradient(160deg, ${palette.tokens.secondary}, ${palette.tokens.dark})` }}>
              <div className="phone-grid">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="phone-app">
                    <span className="phone-icon phone-icon--blank" />
                    <span>App</span>
                  </div>
                ))}
                <div className="phone-app">
                  <span className="phone-icon">
                    <LogoImage set={set} slot="icon" height={44} />
                  </span>
                  <span>{set.name.split(' ')[0]}</span>
                </div>
              </div>
            </div>
            <figcaption>Phone home screen · app icon</figcaption>
          </figure>

          <figure className="usage">
            <div className="usage-social" style={{ background: 'var(--t-card)' }}>
              <span className="social-avatar">
                <LogoImage set={set} slot="icon" height={56} />
              </span>
              <div style={{ fontFamily: 'var(--ty-p1-font)' }}>
                <strong style={{ color: 'var(--t-heading)' }}>{set.name}</strong>
                <span style={{ color: 'var(--t-muted)' }}>@{set.name.toLowerCase().replace(/[^a-z0-9]+/g, '')} · 2,481 followers</span>
              </div>
            </div>
            <figcaption>Social profile · avatar (icon)</figcaption>
          </figure>
        </ThemeScope>
      </div>
      <SaveBar slice="logos" item={set} />
      {newFrom && <NewItemDialog slice="logos" sourceId={newFrom} onClose={() => setNewFrom(null)} make={(src, id, name) => ({ ...src, id, name, builtin: false })} />}
    </div>
  )
}

function SlotCard({
  set, slotKey, label, desc, tokens, onUpload, onClear, onDownload, onHeight,
}: {
  set: LogoSet
  slotKey: LogoSlotKey
  label: string
  desc: string
  tokens: Record<string, string>
  onUpload: (f: File) => void
  onClear: () => void
  onDownload: (s: LogoSlot) => void
  onHeight: (h: number) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const slot = set.slots[slotKey]
  const url = useSlotUrl(slot)
  const stageBg = slotKey === 'reversed' ? tokens.dark : slotKey === 'primary' ? tokens.card : undefined
  return (
    <div
      className="slot"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f) onUpload(f)
      }}
    >
      <div className={slotKey === 'icon' ? 'slot-stage slot-stage--checker' : 'slot-stage'} style={{ background: stageBg }}>
        {url ? <img src={url} alt={label} /> : <span className="slot-empty">No file – drop an SVG or PNG</span>}
      </div>
      <div className="slot-info">
        <strong>{label}</strong>
        <small>{desc}</small>
        {slot && <code>{slot.name}</code>}
      </div>
      <label className="slot-height">
        <span>
          Height on site
          {slotKey !== 'icon' && <small>Shared by primary and reversed</small>}
        </span>
        <NumberField value={logoHeight(set, slotKey)} min={12} max={120} onChange={(n) => n != null && onHeight(n)} ariaLabel={`${label} height in px`} small />
        px
        {logoHeight(set, slotKey) !== LOGO_HEIGHTS[slotKey] && (
          <button className="icon-btn" title={`Reset to ${LOGO_HEIGHTS[slotKey]}`} onClick={() => onHeight(LOGO_HEIGHTS[slotKey])}>
            <Icon name="reset" size={13} />
          </button>
        )}
      </label>
      <div className="slot-actions">
        <button className="ui-btn" onClick={() => input.current?.click()}>
          <Icon name="upload" size={15} /> {slot ? 'Replace' : 'Upload'}
        </button>
        {slot && (
          <>
            <button className="icon-btn" title="Download" onClick={() => onDownload(slot)}>
              <Icon name="download" size={16} />
            </button>
            <button className="icon-btn icon-btn--danger" title="Clear slot" onClick={onClear}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onUpload(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
