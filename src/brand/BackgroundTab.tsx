import { useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../components/Icon'
import { useDialogs } from '../components/Dialogs'
import { blankBackground, PATTERNS } from '../data/backgrounds'
import { hexToRgb } from '../lib/color'
import { putAsset } from '../lib/db'
import { refHex, resolveColor } from '../lib/theme'
import { uid, useApplied, useBrand, useSelected } from '../store/BrandStore'
import type { Background, BackgroundType, ColorRef, Tokens } from '../types'
import { ColorField } from './ComponentsTab'
import { ThemeScope, DsButton } from './ds'
import { logoHeight } from '../data/logos'
import { LogoImage } from './LogosTab'
import { ItemHeader, ItemSwitcher, NewItemDialog, SaveBar, SectionTitle, useAssetUrl } from './shared'

const TYPES: { value: BackgroundType; label: string; icon: string }[] = [
  { value: 'pattern', label: 'Pattern', icon: 'grid' },
  { value: 'image', label: 'Image', icon: 'image' },
  { value: 'video', label: 'Video', icon: 'video' },
]

const svgUrl = (svg: string) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`

export function patternCss(p: Background['pattern'], tokens: Tokens): CSSProperties {
  const c = resolveColor(p.color, tokens)
  const base = resolveColor(p.base, tokens)
  const s = p.scale
  switch (p.kind) {
    case 'dots':
      return { backgroundColor: base, backgroundImage: `radial-gradient(${c} 1.6px, transparent 1.8px)`, backgroundSize: `${s}px ${s}px` }
    case 'grid':
      return { backgroundColor: base, backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: `${s}px ${s}px` }
    case 'diagonal':
      return { backgroundColor: base, backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 ${s * 0.35}px, transparent ${s * 0.35}px ${s}px)` }
    case 'checks':
      return { backgroundColor: base, backgroundImage: `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`, backgroundSize: `${s * 2}px ${s * 2}px` }
    case 'waves': {
      const w = s * 2, h = s
      const path = `M0 ${h / 2} Q ${w / 4} 0 ${w / 2} ${h / 2} T ${w} ${h / 2}`
      return { backgroundColor: base, backgroundImage: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><path d='${path}' fill='none' stroke='${c}' stroke-width='2'/></svg>`), backgroundSize: `${w}px ${h}px` }
    }
    case 'noise': {
      const { r, g, b } = hexToRgb(refHex(p.color, tokens))
      const a = p.color.alpha / 100
      const m = `0 0 0 0 ${r / 255} 0 0 0 0 ${g / 255} 0 0 0 0 ${b / 255} 0 0 0 ${a * 1.6} 0`
      return {
        backgroundColor: base,
        backgroundImage: svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' width='${s}' height='${s}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='${m}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`),
        backgroundSize: `${s}px ${s}px`,
      }
    }
  }
}

function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** True when text on this background should be light. */
export function isDarkBackground(bg: Background, tokens: Tokens) {
  if (bg.type === 'pattern') return luminance(refHex(bg.pattern.base, tokens)) < 0.5
  const ov: ColorRef = bg.type === 'image' ? bg.image.overlay : bg.video.overlay
  const hasMedia = bg.type === 'image' ? bg.image.assetId : bg.video.assetId
  if (!hasMedia) return true // placeholder gradient is dark
  return ov.alpha >= 30 && luminance(refHex(ov, tokens)) < 0.5
}

export function BackgroundLayer({ bg, tokens }: { bg: Background; tokens: Tokens }) {
  const imageUrl = useAssetUrl(bg.type === 'image' ? bg.image.assetId : null)
  const videoUrl = useAssetUrl(bg.type === 'video' ? bg.video.assetId : null)
  if (bg.type === 'pattern') return <div className="bg-layer" style={patternCss(bg.pattern, tokens)} />
  const media = bg.type === 'image' ? bg.image : bg.video
  const url = bg.type === 'image' ? imageUrl : videoUrl
  const blur = media.blur ? { filter: `blur(${media.blur}px)`, transform: 'scale(1.06)' } : {}
  return (
    <div className="bg-layer">
      {!media.assetId ? (
        <div className="bg-placeholder" style={{ background: `linear-gradient(135deg, ${tokens.dark}, ${tokens.primary})` }}>
          <Icon name={bg.type} size={28} />
          <span>{bg.type === 'image' ? 'Upload an image' : 'Upload a video'}</span>
        </div>
      ) : !url ? null : bg.type === 'image' ? (
        <img src={url} alt="" style={{ objectPosition: `${bg.image.focalX}% ${bg.image.focalY}%`, ...blur }} />
      ) : (
        <video src={url} autoPlay muted loop playsInline style={blur} />
      )}
      {media.assetId && <div className="bg-overlay" style={{ background: resolveColor(media.overlay, tokens) }} />}
    </div>
  )
}

export function BackgroundTab() {
  const bg = useSelected('backgrounds')
  const palette = useApplied('palettes')
  const typo = useApplied('typography')
  const logos = useApplied('logos')
  const { update } = useBrand()
  const { toast } = useDialogs()
  const [newFrom, setNewFrom] = useState<string | null>(null)
  const [newType, setNewType] = useState<BackgroundType | 'copy'>('copy')
  const tokens = palette.tokens
  const dark = isDarkBackground(bg, tokens)

  const patch = (fn: (b: Background) => Background) => update('backgrounds', bg.id, fn)

  const upload = async (file: File, kind: 'image' | 'video') => {
    if (!file.type.startsWith(kind)) return toast(`Please choose ${kind === 'image' ? 'an image' : 'a video'} file`)
    const id = uid('asset')
    try {
      await putAsset({ id, name: file.name, type: file.type, blob: file })
    } catch {
      return toast('Could not store the file in this browser')
    }
    patch((b) => ({ ...b, [kind]: { ...b[kind], assetId: id, fileName: file.name } }))
  }

  return (
    <div className="tab-body">
      <ItemSwitcher slice="backgrounds" onNew={() => (setNewType('copy'), setNewFrom(bg.id))} />
      <div className="panel">
        <ItemHeader slice="backgrounds" item={bg} onDuplicate={() => (setNewType('copy'), setNewFrom(bg.id))} />
        <div className="bg-layout">
          <div className="bg-editor">
            <SectionTitle>Type</SectionTitle>
            <div className="segmented">
              {TYPES.map((t) => (
                <button key={t.value} className={bg.type === t.value ? 'seg seg--on' : 'seg'} onClick={() => patch((b) => ({ ...b, type: t.value }))}>
                  <Icon name={t.icon} size={15} /> {t.label}
                </button>
              ))}
            </div>

            {bg.type === 'pattern' && (
              <>
                <SectionTitle>Pattern</SectionTitle>
                <div className="pattern-grid">
                  {PATTERNS.map((p) => (
                    <button
                      key={p.value}
                      className={bg.pattern.kind === p.value ? 'pattern-tile pattern-tile--on' : 'pattern-tile'}
                      onClick={() => patch((b) => ({ ...b, pattern: { ...b.pattern, kind: p.value } }))}
                    >
                      <span style={patternCss({ ...bg.pattern, kind: p.value, scale: Math.min(bg.pattern.scale, 30) }, tokens)} />
                      {p.label}
                    </button>
                  ))}
                </div>
                <Field label="Pattern colour">
                  <ColorField value={bg.pattern.color} tokens={tokens} onChange={(color) => patch((b) => ({ ...b, pattern: { ...b.pattern, color } }))} />
                </Field>
                <Field label="Base colour">
                  <ColorField value={bg.pattern.base} tokens={tokens} onChange={(base) => patch((b) => ({ ...b, pattern: { ...b.pattern, base } }))} />
                </Field>
                <Field label="Scale">
                  <div className="range-row">
                    <input type="range" min={6} max={200} value={bg.pattern.scale} onChange={(e) => patch((b) => ({ ...b, pattern: { ...b.pattern, scale: Number(e.target.value) } }))} />
                    <span>{bg.pattern.scale}px</span>
                  </div>
                </Field>
              </>
            )}

            {bg.type === 'image' && (
              <>
                <SectionTitle>Image</SectionTitle>
                <DropZone kind="image" fileName={bg.image.fileName} onFile={(f) => upload(f, 'image')} onClear={() => patch((b) => ({ ...b, image: { ...b.image, assetId: null, fileName: null } }))} />
                {bg.image.assetId && (
                  <Field label="Focal point" hint="Click the image to choose what stays in view">
                    <FocalPicker bg={bg} onChange={(x, y) => patch((b) => ({ ...b, image: { ...b.image, focalX: x, focalY: y } }))} />
                  </Field>
                )}
                <Field label="Overlay">
                  <ColorField value={bg.image.overlay} tokens={tokens} onChange={(overlay) => patch((b) => ({ ...b, image: { ...b.image, overlay } }))} />
                </Field>
                <Field label="Blur">
                  <div className="range-row">
                    <input type="range" min={0} max={30} value={bg.image.blur} onChange={(e) => patch((b) => ({ ...b, image: { ...b.image, blur: Number(e.target.value) } }))} />
                    <span>{bg.image.blur}px</span>
                  </div>
                </Field>
              </>
            )}

            {bg.type === 'video' && (
              <>
                <SectionTitle>Video</SectionTitle>
                <DropZone kind="video" fileName={bg.video.fileName} onFile={(f) => upload(f, 'video')} onClear={() => patch((b) => ({ ...b, video: { ...b.video, assetId: null, fileName: null } }))} />
                <p className="muted small">Plays muted and looped. Keep files short (under ~20 MB) for fast loading.</p>
                <Field label="Overlay">
                  <ColorField value={bg.video.overlay} tokens={tokens} onChange={(overlay) => patch((b) => ({ ...b, video: { ...b.video, overlay } }))} />
                </Field>
                <Field label="Blur">
                  <div className="range-row">
                    <input type="range" min={0} max={30} value={bg.video.blur} onChange={(e) => patch((b) => ({ ...b, video: { ...b.video, blur: Number(e.target.value) } }))} />
                    <span>{bg.video.blur}px</span>
                  </div>
                </Field>
              </>
            )}
          </div>

          <div className="bg-preview">
            <SectionTitle>Home page preview</SectionTitle>
            <ThemeScope palette={palette} typo={typo} className="hero-mock">
              <BackgroundLayer bg={bg} tokens={tokens} />
              <div className="hero-content" style={{ color: dark ? 'var(--t-on-dark)' : 'var(--t-heading)' }}>
                <div className="hero-nav">
                  <LogoImage set={logos} slot={dark ? 'reversed' : 'primary'} height={logoHeight(logos, dark ? 'reversed' : 'primary')} />
                  <div className="hero-links" style={{ fontFamily: 'var(--ty-p1-font)' }}>
                    <span>About</span>
                    <span>Membership</span>
                    <span>Events</span>
                    <span>Contact</span>
                  </div>
                  <DsButton id="btnPrimary" label="Join now" />
                </div>
                <div className="hero-copy">
                  <h1 style={{ fontFamily: 'var(--ty-display2-font)', fontWeight: 'var(--ty-display2-weight)' as CSSProperties['fontWeight'], fontSize: 'clamp(26px, 4vw, 44px)', lineHeight: 1.1, margin: 0, color: 'inherit' }}>
                    Setting the Standard
                  </h1>
                  <p style={{ fontFamily: 'var(--ty-p1-font)', fontSize: 'var(--ty-p1-size)', opacity: 0.85, maxWidth: 440 }}>
                    A place to train, compete and belong. Join a community that has raised the bar for more than 25 years.
                  </p>
                  <div className="pv-buttons">
                    <DsButton id="btnPrimary" label="Become a member" />
                    <DsButton id="btnSoft" label="Learn more" />
                  </div>
                </div>
              </div>
            </ThemeScope>
            <p className="muted small">
              Uses the applied palette ({palette.name}), typography ({typo.name}) and logo set ({logos.name}).
            </p>
          </div>
        </div>
      </div>
      <SaveBar slice="backgrounds" item={bg} />
      {newFrom && (
        <NewItemDialog
          slice="backgrounds"
          sourceId={newFrom}
          onClose={() => setNewFrom(null)}
          make={(src, id, name) => (newType === 'copy' ? { ...src, id, name, builtin: false } : { ...blankBackground(id, name, newType), pattern: src.pattern })}
          extra={
            <label className="form-row">
              <span>Start as</span>
              <select className="ui-input" value={newType} onChange={(e) => setNewType(e.target.value as BackgroundType | 'copy')}>
                <option value="copy">Exact copy</option>
                <option value="pattern">Blank pattern</option>
                <option value="image">Blank image</option>
                <option value="video">Blank video</option>
              </select>
            </label>
          }
        />
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-field">
      <div className="field-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  )
}

function DropZone({ kind, fileName, onFile, onClear }: { kind: 'image' | 'video'; fileName: string | null; onFile: (f: File) => void; onClear: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div
      className={over ? 'dropzone dropzone--over' : 'dropzone'}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <Icon name="upload" size={20} />
      <div>
        {fileName ? <strong>{fileName}</strong> : <strong>Drop {kind === 'image' ? 'an image' : 'a video'} here</strong>}
        <small>{kind === 'image' ? 'JPG, PNG, WebP or SVG' : 'MP4 or WebM'}</small>
      </div>
      <button className="ui-btn" onClick={() => input.current?.click()}>
        {fileName ? 'Replace' : 'Choose file'}
      </button>
      {fileName && (
        <button className="ui-btn ui-btn--danger" onClick={onClear}>
          Remove
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={kind === 'image' ? 'image/*' : 'video/*'}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function FocalPicker({ bg, onChange }: { bg: Background; onChange: (x: number, y: number) => void }) {
  const url = useAssetUrl(bg.image.assetId)
  if (!url) return null
  return (
    <div
      className="focal"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onChange(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100))
      }}
    >
      <img src={url} alt="Focal point picker" />
      <span className="focal-dot" style={{ left: `${bg.image.focalX}%`, top: `${bg.image.focalY}%` }} />
    </div>
  )
}
