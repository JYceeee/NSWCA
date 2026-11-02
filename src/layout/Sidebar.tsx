import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { LogoImage } from '../brand/LogosTab'
import { Icon } from '../components/Icon'
import { logoHeight } from '../data/logos'
import { ADMIN_NAV, isActive, NAV, type NavItem } from '../data/menus'
import { mv } from '../lib/menuTheme'
import { ty } from '../lib/theme'
import { hashFor, useApplied, useBrand, useSession } from '../store/BrandStore'
import { usePageLabel, useVisibleNav } from './useNav'
import type { MenuSet, PageId } from '../types'

const P = 'mn-sb'
const c = (k: string) => mv(P, `c-${k}`)
/** Lets the cursor cross the gap between a tab and its window. */
const CLOSE_DELAY = 160

/** A top-level side bar row, on the look set in Admin › Menu. */
export const sidebarItemStyle = (active: boolean): CSSProperties => ({
  ...ty(`${P}-parent`),
  padding: `${mv(P, 'parent-padY')} ${mv(P, 'parent-padX')}`,
  background: active ? c('selected') : undefined,
  color: active ? c('selectedText') : c('text'),
})

/**
 * The admin portal's side bar: always open on desktop, a drawer on phones. The menu's look, its own pages.
 * AccountBar fills #sb-account.
 */
export function AdminSidebar() {
  const { ui, navigate } = useBrand()
  const { pendingApprovals } = useSession()
  const logos = useApplied('logos')
  const label = usePageLabel()
  return (
    <div className="sb-slot sb-slot--fixed">
      <aside className="app-sidebar app-sidebar--wide sb-portal" style={{ background: c('bg') }}>
        <div className="app-sidebar-head" style={{ borderBottom: `1px solid ${c('divider')}` }}>
          <LogoImage set={logos} slot="reversed" height={logoHeight(logos, 'reversed')} />
        </div>
        <nav className="app-menu" style={{ gap: mv(P, 'parent-gap') }}>
          {ADMIN_NAV.map(({ id, icon }) => (
            <a
              key={id}
              href={`#${hashFor({ ...ui, page: id, eventId: null })}`}
              className={id === ui.page ? 'app-menu-item is-active' : 'app-menu-item'}
              style={sidebarItemStyle(id === ui.page)}
              aria-current={id === ui.page ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault()
                navigate({ page: id })
              }}
            >
              <span className="sb-icon">
                <Icon name={icon} size={18} />
              </span>
              <span className="sb-label">{label(id)}</span>
              {id === 'approvals' && pendingApprovals > 0 && <span className="rv-count sb-count">{pendingApprovals}</span>}
            </a>
          ))}
        </nav>
        <div className="sb-account" style={{ borderTop: `1px solid ${c('divider')}`, color: c('smallText') }}>
          <div id="sb-account" className="sb-account-list" />
        </div>
      </aside>
    </div>
  )
}

/**
 * The app's own sidebar. Modes: cursor landing (icons, expands over the page on hover),
 * fix (always expanded) and icon only. Sub tabs open in a small window on hover or click.
 * On mobile it is a drawer with sub tabs listed inline.
 */
export function AppSidebar({ menu, mobile, showHead }: { menu: MenuSet; mobile: boolean; showHead: boolean }) {
  const { ui, navigate } = useBrand()
  const logos = useApplied('logos')
  const nav = useVisibleNav()
  const { subOpen } = menu.sidebar
  const mode = mobile ? 'fixed' : menu.sidebar.mode
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [inline, setInline] = useState<Set<string>>(() => new Set(NAV.filter((n) => isActive(n, ui.page)).map((n) => n.id)))
  const timer = useRef<number>()
  const ref = useRef<HTMLElement>(null)
  const wide = mode === 'fixed' || expanded
  const onHover = subOpen === 'hover' && !mobile

  // Start fresh whenever the behaviour changes.
  useEffect(() => {
    setOpen(null)
    setExpanded(false)
  }, [menu.sidebar.mode, subOpen, mobile])

  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null)
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

  const enter = (item: NavItem) => {
    if (!onHover) return
    clearTimeout(timer.current)
    // Icon only: tabs without sub tabs show their name instead.
    setOpen(item.children || mode === 'icons' ? item.id : null)
  }
  const leave = () => {
    if (!onHover) return
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(null), CLOSE_DELAY)
  }
  const click = (item: NavItem) => {
    if (item.page) return go(item.page)
    if (mobile)
      return setInline((s) => {
        const n = new Set(s)
        if (n.has(item.id)) n.delete(item.id)
        else n.add(item.id)
        return n
      })
    setOpen(open === item.id && !onHover ? null : item.id)
  }

  const itemStyle = sidebarItemStyle

  return (
    <div className={`sb-slot sb-slot--${mode}`}>
      <aside
        ref={ref}
        className={wide ? 'app-sidebar app-sidebar--wide' : 'app-sidebar'}
        style={{ background: c('bg') }}
        onMouseEnter={() => mode === 'hover' && setExpanded(true)}
        onMouseLeave={() => {
          if (mode !== 'hover') return
          setExpanded(false)
          setOpen(null)
        }}
      >
        {showHead && (
          <div className="app-sidebar-head" style={{ borderBottom: `1px solid ${c('divider')}` }}>
            {wide ? (
              <>
                <LogoImage set={logos} slot="reversed" height={logoHeight(logos, 'reversed')} />
                <div className="sb-label" style={{ ...ty('ty-caption'), color: c('smallText'), marginTop: 6 }}>Design system</div>
              </>
            ) : (
              <LogoImage set={logos} slot="icon" height={logoHeight(logos, 'icon')} />
            )}
          </div>
        )}
        <nav className="app-menu" style={{ gap: mv(P, 'parent-gap') }}>
          {nav.map((item) => {
            const active = isActive(item, ui.page)
            const showWindow = !mobile && open === item.id
            return (
              <div key={item.id} className="sb-entry" onMouseEnter={() => enter(item)} onMouseLeave={leave}>
                <a
                  href={item.page ? `#${hashFor({ ...ui, page: item.page, eventId: null })}` : undefined}
                  role={item.page ? undefined : 'button'}
                  tabIndex={0}
                  className={active ? 'app-menu-item is-active' : 'app-menu-item'}
                  style={itemStyle(active)}
                  aria-current={item.page === ui.page ? 'page' : undefined}
                  aria-expanded={item.children ? showWindow || (mobile && inline.has(item.id)) : undefined}
                  title={wide ? undefined : item.label}
                  onClick={(e) => {
                    e.preventDefault()
                    click(item)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !item.page && click(item)}
                >
                  <span className="sb-icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className="sb-label">{item.label}</span>
                  {item.children && (
                    <span className="sb-caret" style={{ color: c('smallText') }}>
                      <Icon name={mobile && inline.has(item.id) ? 'chevronDown' : 'chevron'} size={14} />
                    </span>
                  )}
                </a>
                {mobile && item.children && inline.has(item.id) && (
                  <div className="sb-inline" style={{ gap: mv(P, 'sub-gap') }}>
                    {item.children.map((ch) => (
                      <SubLink key={ch.id} label={ch.label} active={ch.id === ui.page} onClick={() => go(ch.id)} />
                    ))}
                  </div>
                )}
                {showWindow && (
                  <div className="sb-window-wrap">
                    <div className="sb-window" style={{ background: c('windowBg'), borderColor: c('windowBorder') }} role="menu">
                      {item.children ? (
                        <>
                          <div style={{ ...ty(`${P}-windowTitle`), color: c('smallText'), padding: `${mv(P, 'windowTitle-padY')} ${mv(P, 'windowTitle-padX')}` }}>
                            {item.label}
                          </div>
                          <div className="sb-window-list" style={{ gap: mv(P, 'sub-gap') }}>
                            {item.children.map((ch) => (
                              <SubLink key={ch.id} label={ch.label} active={ch.id === ui.page} onClick={() => go(ch.id)} />
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ ...ty(`${P}-windowTitle`), color: c('windowText'), padding: `${mv(P, 'windowTitle-padY')} ${mv(P, 'windowTitle-padX')}` }}>
                          {item.label}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        {wide && (
          <div className="app-sidebar-foot sb-label" style={{ borderTop: `1px solid ${c('divider')}`, color: c('smallText') }}>
            Saved in this browser
          </div>
        )}
      </aside>
    </div>
  )
}

function SubLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <a
      href="#"
      role="menuitem"
      className={active ? 'sb-sub is-active' : 'sb-sub'}
      style={{
        ...ty(`${P}-sub`),
        padding: `${mv(P, 'sub-padY')} ${mv(P, 'sub-padX')}`,
        color: c('windowText'),
        background: active ? c('windowSelected') : undefined,
      }}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      {label}
    </a>
  )
}
