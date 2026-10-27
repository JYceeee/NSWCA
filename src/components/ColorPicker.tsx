import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { hexToRgb, hslToRgb, hsvToRgb, normalizeHex, rgbToHex, rgbToHsl, rgbToHsv, type HSV } from '../lib/color'
import { Icon } from './Icon'

type Mode = 'rgb' | 'hex' | 'hsl'
const MODES: Mode[] = ['rgb', 'hex', 'hsl']

interface Props {
  anchor: HTMLElement
  value: string
  onChange: (hex: string) => void
  onClose: () => void
  footer?: ReactNode
}

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
  }
}

export function ColorPicker({ anchor, value, onChange, onClose, footer }: Props) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value)))
  const [mode, setMode] = useState<Mode>('rgb')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef(value)

  // Follow outside changes (e.g. undo) without losing the hue of greys.
  useEffect(() => {
    if (normalizeHex(value) !== normalizeHex(lastEmitted.current)) {
      setHsv(rgbToHsv(hexToRgb(value)))
      lastEmitted.current = value
    }
  }, [value])

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const w = 300, h = ref.current?.offsetHeight ?? 380
    let top = r.bottom + 6
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
    setPos({ top, left })
  }, [anchor])

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const scroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [anchor, onClose])

  const emit = (next: HSV) => {
    setHsv(next)
    const hex = rgbToHex(hsvToRgb(next))
    lastEmitted.current = hex
    onChange(hex)
  }
  const emitHex = (hex: string) => {
    const n = normalizeHex(hex)
    if (n) emit(rgbToHsv(hexToRgb(n)))
  }

  const drag = (el: HTMLElement, e: React.PointerEvent, fn: (x: number, y: number) => void) => {
    const move = (ev: PointerEvent | React.PointerEvent) => {
      const r = el.getBoundingClientRect()
      fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)))
    }
    move(e)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const hex = rgbToHex(hsvToRgb(hsv))
  const rgb = hexToRgb(hex)
  const hsl = rgbToHsl(rgb)

  const eyedrop = async () => {
    if (!window.EyeDropper) return
    try {
      const r = await new window.EyeDropper().open()
      emitHex(r.sRGBHex)
    } catch {
      /* cancelled */
    }
  }

  return createPortal(
    <div className="picker" ref={ref} style={pos} role="dialog" aria-label="Colour picker">
      <div
        className="picker-sv"
        style={{ background: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y) => emit({ ...hsv, s: x, v: 1 - y }))}
      >
        <div className="picker-sv-white" />
        <div className="picker-sv-black" />
        <div className="picker-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div className="picker-row">
        <button className="icon-btn" title={window.EyeDropper ? 'Pick from screen' : 'Eyedropper not supported in this browser'} disabled={!window.EyeDropper} onClick={eyedrop}>
          <Icon name="eyedropper" size={18} />
        </button>
        <div className="picker-preview" style={{ background: hex }} />
        <div className="picker-hue" onPointerDown={(e) => drag(e.currentTarget, e, (x) => emit({ ...hsv, h: Math.min(359.9, x * 360) }))}>
          <div className="picker-knob picker-knob--hue" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
        </div>
      </div>
      <div className="picker-inputs">
        {mode === 'hex' && <HexInput value={hex} onCommit={emitHex} />}
        {mode === 'rgb' &&
          (['r', 'g', 'b'] as const).map((k) => (
            <NumInput key={k} label={k.toUpperCase()} value={rgb[k]} max={255} onCommit={(n) => emitHex(rgbToHex({ ...rgb, [k]: n }))} />
          ))}
        {mode === 'hsl' && (
          <>
            <NumInput label="H" value={Math.round(hsl.h)} max={360} onCommit={(n) => emit(rgbToHsv(hslToRgb({ ...hsl, h: n })))} />
            <NumInput label="S" value={Math.round(hsl.s * 100)} max={100} onCommit={(n) => emit(rgbToHsv(hslToRgb({ ...hsl, s: n / 100 })))} />
            <NumInput label="L" value={Math.round(hsl.l * 100)} max={100} onCommit={(n) => emit(rgbToHsv(hslToRgb({ ...hsl, l: n / 100 })))} />
          </>
        )}
        <button className="picker-mode" title="Switch input mode" onClick={() => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])}>
          {mode.toUpperCase()}
          <span aria-hidden>⇅</span>
        </button>
      </div>
      {footer && <div className="picker-footer">{footer}</div>}
    </div>,
    document.body,
  )
}

function NumInput({ label, value, max, onCommit }: { label: string; value: number; max: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Math.min(max, Math.max(0, Math.round(Number(text))))
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }
  return (
    <label className="picker-field">
      <input value={text} inputMode="numeric" onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <span>{label}</span>
    </label>
  )
}

function HexInput({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = () => (normalizeHex(text) ? onCommit(text) : setText(value))
  return (
    <label className="picker-field picker-field--hex">
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} spellCheck={false} />
      <span>HEX</span>
    </label>
  )
}
