import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../components/Icon'

/** True inside the phone preview's iframe: it shows saved settings and never writes to storage. */
export const IS_PREVIEW = new URLSearchParams(window.location.search).get('preview') === 'mobile'

const DEVICES = [
  { id: 'se', label: 'iPhone SE', w: 375, h: 667 },
  { id: 'iphone', label: 'iPhone 15', w: 393, h: 852 },
  { id: 'pixel', label: 'Pixel 8', w: 412, h: 915 },
]

/** Inside the preview: reload when the main window saves, so it always shows the latest applied settings. */
export function usePreviewSync() {
  useEffect(() => {
    if (!IS_PREVIEW) return
    const h = (e: StorageEvent) => e.key?.startsWith('principles:brand') && window.location.reload()
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])
}

/** The app itself at phone size, in an iframe that opens on the current page. */
export function MobilePreview({ onClose }: { onClose: () => void }) {
  const [device, setDevice] = useState(DEVICES[1])
  const [landscape, setLandscape] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const [src] = useState(() => `${window.location.pathname}?preview=mobile${window.location.hash}`)
  const w = landscape ? device.h : device.w
  const h = landscape ? device.w : device.h
  // Shrink the phone to fit the window.
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const r = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('resize', r)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('resize', r)
      window.removeEventListener('keydown', k)
    }
  }, [onClose])
  const BEZEL = 14
  const scale = Math.min(1, (vp.h - 120) / (h + BEZEL * 2), (vp.w - 48) / (w + BEZEL * 2))

  return createPortal(
    <div className="mp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal aria-label="Mobile preview">
      <div className="mp-bar">
        <strong>
          <Icon name="phone" size={16} /> Mobile preview
        </strong>
        <select className="ui-input" value={device.id} onChange={(e) => setDevice(DEVICES.find((d) => d.id === e.target.value)!)} aria-label="Device">
          {DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} · {d.w}×{d.h}
            </option>
          ))}
        </select>
        <button className="ui-btn ui-btn--small" onClick={() => setLandscape(!landscape)}>
          <Icon name="reset" size={14} /> {landscape ? 'Portrait' : 'Landscape'}
        </button>
        <button className="ui-btn ui-btn--small" onClick={() => frame.current?.contentWindow?.location.reload()}>
          Reload
        </button>
        <span className="mp-note">Shows saved, applied settings – edits made inside the phone aren’t saved.</span>
        <button className="icon-btn mp-close" onClick={onClose} aria-label="Close preview">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="mp-stage">
        <div className="mp-phone" style={{ width: w + BEZEL * 2, height: h + BEZEL * 2, padding: BEZEL, transform: `scale(${scale})` }}>
          <iframe ref={frame} src={src} title="Phone preview" width={w} height={h} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
