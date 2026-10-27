import { forwardRef, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { LogoImage } from '../brand/LogosTab'
import { Icon } from '../components/Icon'
import { logoHeight } from '../data/logos'
import { isActive, NAV, type NavItem } from '../data/menus'
import { lookPrefix, mv } from '../lib/menuTheme'
import { ty } from '../lib/theme'
import { hashFor, useApplied, useBrand } from '../store/BrandStore'
import type { BarVersion, MenuSet, PageId } from '../types'

const CLOSE_DELAY = 160

/** Full-width bar above the sidebar: logo + parent tabs, sub tabs in a dropdown (hover or click, as the sidebar). */
export const TopBar = forwardRef<HTMLElement, { menu: MenuSet; version: BarVersion; toggle: ReactNode; onPreview?: () => void }>(function TopBar(
  { menu, version, toggle, onPreview },
  ref,
) {
  const { ui, navigate } = useBrand()
  const logos = useApplied('logos')
  const p = lookPrefix('topbar', version)
  const c = (k: string) => mv(p, `c-${k}`)
  const onHover = menu.sidebar.subOpen === 'hover'
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<number>()
  const nav = useRef<HTMLElement>(null)

  useEffect(() => setOpen(null), [onHover])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !nav.current?.contains(e.target as Node) && setOpen(null)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])

  const go = (page: PageId) => {
    setOpen(null)
    navigate({ page })
  }
  const click = (item: NavItem) => {
    if (item.page) return go(item.page)
    setOpen(open === item.id && !onHover ? null : item.id)
  }

  return (
    <header
      ref={ref}
      className="app-topbar"
      style={{ background: c('bg'), borderBottom: `1px solid ${c('divider')}`, height: mv(p, 'height'), padding: `0 ${mv(p, 'padX')}` }}
    >
      {toggle}
      <span className="tb-logo">
        <LogoImage set={logos} slot={version === 'dark' ? 'reversed' : 'primary'} height={logoHeight(logos, version === 'dark' ? 'reversed' : 'primary')} />
      </span>
      <nav className="tb-nav" ref={nav} style={{ gap: mv(p, 'tab-gap') }}>
        {NAV.map((item) => {
          const active = isActive(item, ui.page)
          return (
            <div
              key={item.id}
              className="tb-entry"
              onMouseEnter={() => {
                if (!onHover || !item.children) return
                clearTimeout(timer.current)
                setOpen(item.id)
              }}
              onMouseLeave={() => {
                if (!onHover) return
                clearTimeout(timer.current)
                timer.current = window.setTimeout(() => setOpen(null), CLOSE_DELAY)
              }}
            >
              <a
                href={item.page ? `#${hashFor({ ...ui, page: item.page, eventId: null })}` : undefined}
                role={item.page ? undefined : 'button'}
                tabIndex={0}
                className="tb-tab"
                aria-current={item.page === ui.page ? 'page' : undefined}
                aria-expanded={item.children ? open === item.id : undefined}
                style={
                  {
                    ...ty(`${p}-tab`),
                    padding: `0 ${mv(p, 'tab-padX')}`,
                    color: active ? c('active') : c('text'),
                    borderBottomColor: active ? c('indicator') : 'transparent',
                    '--hov': c('hover'),
                  } as CSSProperties
                }
                onClick={(e) => {
                  e.preventDefault()
                  click(item)
                }}
                onKeyDown={(e) => e.key === 'Enter' && !item.page && click(item)}
              >
                {item.label}
                {item.children && <Icon name="chevronDown" size={14} />}
              </a>
              {open === item.id && item.children && (
                <div className="tb-drop-wrap">
                  <div className="tb-drop" role="menu" style={{ background: c('dropdownBg'), borderColor: c('dropdownBorder'), gap: mv(p, 'sub-gap') }}>
                    {item.children.map((ch) => (
                      <a
                        key={ch.id}
                        href={`#${ch.id}`}
                        role="menuitem"
                        className="tb-sub"
                        aria-current={ch.id === ui.page ? 'page' : undefined}
                        style={
                          {
                            ...ty(`${p}-sub`),
                            padding: `${mv(p, 'sub-padY')} ${mv(p, 'sub-padX')}`,
                            color: c('dropdownText'),
                            background: ch.id === ui.page ? c('dropdownHover') : undefined,
                            '--hov': c('dropdownHover'),
                          } as CSSProperties
                        }
                        onClick={(e) => {
                          e.preventDefault()
                          go(ch.id)
                        }}
                      >
                        {ch.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </nav>
      {onPreview && (
        <button className="tb-preview" style={{ ...ty(`${p}-tab`), color: c('text'), '--hov': c('hover') } as CSSProperties} onClick={onPreview}>
          <Icon name="phone" size={16} /> Preview mobile
        </button>
      )}
    </header>
  )
})
