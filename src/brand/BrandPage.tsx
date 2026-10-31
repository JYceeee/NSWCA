import { useEffect, useRef } from 'react'
import { PageHead } from '../site/PageHead'
import { useBrand } from '../store/BrandStore'
import type { BrandTab, SliceKey } from '../types'
import { ComponentsTab } from './ComponentsTab'
import { LogosTab } from './LogosTab'
import { PaletteTab } from './PaletteTab'
import { PinnedPreview } from './PinnedPreview'
import { TypographyTab } from './TypographyTab'

const TABS: { id: BrandTab; label: string; slice: SliceKey }[] = [
  { id: 'palette', label: 'Colour palette', slice: 'palettes' },
  { id: 'logos', label: 'Logos', slice: 'logos' },
  { id: 'typography', label: 'Typography', slice: 'typography' },
  { id: 'components', label: 'Components', slice: 'palettes' },
]

export function BrandPage() {
  const { ui, setTab, dirty } = useBrand()
  const sticky = useRef<HTMLDivElement>(null)

  // Lets scroll targets and sticky panels sit just below the pinned preview.
  useEffect(() => {
    const el = sticky.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--sticky-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="brand-page">
      <PageHead page="brand" title="Brand">
        Colours, logos, type and components – reusable across your apps.
      </PageHead>
      <div className="brand-sticky" ref={sticky}>
        <PinnedPreview />
        <div className="brand-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={ui.tab === t.id} className="brand-tab" onClick={() => setTab(t.id)}>
              {t.label}
              {dirty[t.slice] && <span className="dirty-dot" title="Unsaved changes" />}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {ui.tab === 'palette' && <PaletteTab />}
        {ui.tab === 'logos' && <LogosTab />}
        {ui.tab === 'typography' && <TypographyTab />}
        {ui.tab === 'components' && <ComponentsTab />}
      </div>
    </div>
  )
}
