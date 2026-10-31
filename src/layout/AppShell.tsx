import { useEffect, useRef, useState } from 'react'
import { BrandPage } from '../brand/BrandPage'
import { useSlotUrl } from '../brand/LogosTab'
import { Modal } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { svgDataUrl, tabTitle } from '../data/logos'
import { buildMenuVars } from '../lib/menuTheme'
import { buildThemeVars } from '../lib/theme'
import { EventsPage } from '../events/EventsPage'
import { DocumentsPage } from '../admin/DocumentsPage'
import { AllPlayersPage } from '../admin/AllPlayersPage'
import { PairingsPage } from '../pairing/PairingsPage'
import { ProfilePage } from '../profile/ProfilePage'
import { ApprovalsPage } from '../admin/ApprovalsPage'
import { UsersPage } from '../admin/UsersPage'
import { EnquiriesPage } from '../admin/EnquiriesPage'
import { PageConfigPage } from '../admin/PageConfigPage'
import { ContactPage } from '../site/ContactPage'
import { HomePage } from '../site/HomePage'
import { AccountBar, NoAccess } from '../auth/AccountBar'
import { MenuPage } from '../menu/MenuPage'
import { useApplied, useBrand, useSelected, useSession } from '../store/BrandStore'
import type { BarVersion, LogoSet, MenuSet } from '../types'
import { AppFooter } from './Footer'
import { IS_PREVIEW, MobilePreview, usePreviewSync } from './MobilePreview'
import { AppSidebar } from './Sidebar'
import { useDarkSurface } from './surface'
import { TopBar } from './TopBar'
import { usePageLabel } from './useNav'

/** On the Menu page the chrome previews the menu set being edited; elsewhere it shows the applied one. */
function useShellMenu(): MenuSet {
  const { ui } = useBrand()
  const applied = useApplied('menus')
  const selected = useSelected('menus')
  return ui.page === 'menu' ? selected : applied
}

/** The app itself wears the applied palette + typography, and the menu's variables. */
function useAppTheme(menu: MenuSet) {
  const palette = useApplied('palettes')
  const typo = useApplied('typography')
  useEffect(() => {
    const vars = { ...buildThemeVars(palette, typo), ...buildMenuVars(menu, palette, typo) }
    const root = document.documentElement
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  }, [palette, typo, menu])
}

/** The browser tab shows the applied set's icon / mark (an empty slot gets a letter monogram) and tab title. */
function useFavicon(set: LogoSet) {
  const url = useSlotUrl(set.slots.icon)
  const slot = set.slots.icon
  useEffect(() => {
    if (slot && !url) return // file still loading
    const letter = (set.name.trim().charAt(0).toUpperCase() || '?').replace(/[<&>]/g, '')
    const href =
      url ??
      svgDataUrl(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='16' fill='#1D1D1F'/><text x='32' y='44' text-anchor='middle' font-family='Arial' font-size='34' font-weight='800' fill='white'>${letter}</text></svg>`,
      )
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
    link.type = slot?.kind === 'asset' ? slot.mime : 'image/svg+xml'
  }, [url, slot, set.name])

  const title = tabTitle(set)
  useEffect(() => {
    document.title = title
  }, [title])
}

function useMobile() {
  const q = '(max-width: 900px)'
  const [m, setM] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const mql = window.matchMedia(q)
    const h = () => setM(mql.matches)
    mql.addEventListener('change', h)
    return () => mql.removeEventListener('change', h)
  }, [])
  return m
}

/** Reversed off = always on light. While its Menu tab is open, the version being edited is shown. */
function useVersion(area: 'topbar' | 'footer', menu: MenuSet, autoDark: boolean): BarVersion {
  const { ui } = useBrand()
  if (!menu[area].reversed) return 'light'
  if (ui.page === 'menu' && ui.menuTab === area) return ui.menuVersion[area]
  return autoDark ? 'dark' : 'light'
}

export function AppShell() {
  const { ui } = useBrand()
  const { can } = useSession()
  const pageLabel = usePageLabel()
  const menu = useShellMenu()
  useAppTheme(menu)
  useFavicon(useApplied('logos'))
  const mobile = useMobile()
  const [navOpen, setNavOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  usePreviewSync()
  // Not on a phone, and not inside the preview itself.
  const onPreview = mobile || IS_PREVIEW ? undefined : () => setPreview(true)
  const topRef = useRef<HTMLElement>(null)
  const footRef = useRef<HTMLElement>(null)
  const { topbar, footer } = menu

  // The reversed bar only comes on once a dark section is behind the whole bar: both its edges.
  const topBottomDark = useDarkSurface(topRef, topbar.enabled && topbar.reversed, 'behind', [ui.page])
  const topTopDark = useDarkSurface(topRef, topbar.enabled && topbar.reversed, 'top', [ui.page])
  const topDark = topBottomDark && topTopDark
  const footDark = useDarkSurface(footRef, footer.enabled && footer.reversed, 'above', [ui.page])
  const topVersion = useVersion('topbar', menu, topDark)
  const footVersion = useVersion('footer', menu, footDark)
  // Reversed, it is always see-through.
  const topClear = topDark && topVersion === 'dark'
  const bleed = ui.page === 'home' || ui.page === 'contact'

  useEffect(() => setNavOpen(false), [ui.page])

  // Sticky panels below the bar read its height.
  useEffect(() => {
    const el = topRef.current
    const root = document.documentElement
    if (!el) {
      root.style.setProperty('--topbar-h', '0px')
      return
    }
    const ro = new ResizeObserver(() => root.style.setProperty('--topbar-h', `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [topbar.enabled])

  const toggle = (
    <button className="nav-toggle icon-btn" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle navigation">
      <Icon name="menu" size={20} />
    </button>
  )

  return (
    <div className={['shell', navOpen && 'shell--nav-open', topbar.enabled && 'shell--topbar'].filter(Boolean).join(' ')}>
      {topbar.enabled && <TopBar ref={topRef} menu={menu} version={topVersion} clear={topClear} toggle={toggle} onPreview={onPreview} />}
      <div className="shell-body">
        {/* Off = no sidebar on desktop; phones keep the drawer, as the top bar hides its tabs there. */}
        {(menu.sidebar.enabled !== false || mobile) && <AppSidebar menu={menu} mobile={mobile} showHead={!topbar.enabled} onPreview={onPreview} />}
        {!topbar.enabled && toggle}
        <div className="nav-scrim" onClick={() => setNavOpen(false)} />
        <main className="app-main">
          <div className={bleed ? 'app-page app-page--bleed' : 'app-page'}>
            <AccountBar inTopBar={topbar.enabled} />
            {!can(`page.${ui.page}`) ? (
              <NoAccess page={pageLabel(ui.page)} />
            ) : (
              <>
                {ui.page === 'home' && <HomePage />}
                {ui.page === 'contact' && <ContactPage />}
                {ui.page === 'pages' && <PageConfigPage />}
                {ui.page === 'enquiries' && <EnquiriesPage />}
                {ui.page === 'brand' && <BrandPage />}
                {ui.page === 'menu' && <MenuPage />}
                {ui.page === 'events' && <EventsPage />}
                {ui.page === 'pairings' && <PairingsPage />}
                {ui.page === 'documents' && <DocumentsPage />}
                {ui.page === 'players' && <AllPlayersPage />}
                {ui.page === 'profile' && <ProfilePage />}
                {ui.page === 'users' && <UsersPage />}
                {ui.page === 'approvals' && <ApprovalsPage />}
              </>
            )}
          </div>
          {footer.enabled && <AppFooter ref={footRef} menu={menu} version={footVersion} />}
        </main>
      </div>
      <NavPrompt />
      {preview && <MobilePreview onClose={() => setPreview(false)} />}
    </div>
  )
}

function NavPrompt() {
  const { navPrompt, resolveNav, saved, ui, draft } = useBrand()
  const pageLabel = usePageLabel()
  if (!navPrompt) return null
  const to = <strong>{pageLabel(navPrompt.page ?? 'brand')}</strong>
  if (navPrompt.reason === 'entries')
    return (
      <Modal title="Save your changes to the entries?" onClose={() => resolveNav('stay')} width={460}>
        <div className="modal-body">You’ve edited players on the All entries page. Save the changes before leaving, or discard them.</div>
        <div className="modal-actions">
          <button className="ui-btn" onClick={() => resolveNav('stay')}>Stay</button>
          <button className="ui-btn ui-btn--danger" onClick={() => resolveNav('discard')}>Discard</button>
          <button className="ui-btn ui-btn--primary" onClick={() => resolveNav('apply')} autoFocus>Save</button>
        </div>
      </Modal>
    )
  if (navPrompt.reason === 'details')
    return (
      <Modal title="Discard your event detail changes?" onClose={() => resolveNav('stay')} width={460}>
        <div className="modal-body">You’re editing this event’s details. Leave and lose the changes, or stay and save them.</div>
        <div className="modal-actions">
          <button className="ui-btn" onClick={() => resolveNav('stay')} autoFocus>Stay</button>
          <button className="ui-btn ui-btn--danger" onClick={() => resolveNav('discard')}>Discard changes</button>
        </div>
      </Modal>
    )
  if (navPrompt.reason === 'profile')
    return (
      <Modal title="Discard your profile changes?" onClose={() => resolveNav('stay')} width={460}>
        <div className="modal-body">You’re editing your profile. Leave for {to} and lose the changes, or stay and save them.</div>
        <div className="modal-actions">
          <button className="ui-btn" onClick={() => resolveNav('stay')} autoFocus>Stay</button>
          <button className="ui-btn ui-btn--danger" onClick={() => resolveNav('discard')}>Discard changes</button>
        </div>
      </Modal>
    )
  if (navPrompt.reason === 'pages')
    return (
      <Modal title="Save your Page Config changes?" onClose={() => resolveNav('stay')} width={460}>
        <div className="modal-body">Your page edits aren’t saved yet. Save them before going to {to}, or discard them.</div>
        <div className="modal-actions">
          <button className="ui-btn" onClick={() => resolveNav('stay')}>Stay</button>
          <button className="ui-btn ui-btn--danger" onClick={() => resolveNav('discard')}>Discard</button>
          <button className="ui-btn ui-btn--primary" onClick={() => resolveNav('apply')} autoFocus>Save</button>
        </div>
      </Modal>
    )
  if (navPrompt.reason === 'events')
    return (
      <Modal title="Save your calendar settings?" onClose={() => resolveNav('stay')} width={460}>
        <div className="modal-body">The hours or View by day setting have unsaved changes. Save them before going to {to}, or discard them. (Events are always saved straight away.)</div>
        <div className="modal-actions">
          <button className="ui-btn" onClick={() => resolveNav('stay')}>Stay</button>
          <button className="ui-btn ui-btn--danger" onClick={() => resolveNav('discard')}>Discard</button>
          <button className="ui-btn ui-btn--primary" onClick={() => resolveNav('apply')} autoFocus>Save</button>
        </div>
      </Modal>
    )
  const name = draft.menus.find((m) => m.id === ui.selected.menus)?.name ?? 'This menu set'
  const appliedName = saved.menus.find((m) => m.id === saved.applied.menu)?.name
  return (
    <Modal title="Apply your menu changes?" onClose={() => resolveNav('stay')} width={460}>
      <div className="modal-body">
        The sidebar, top bar and footer are previewing <strong>{name}</strong>. Apply it to the site before going to{' '}
        <strong>{pageLabel(navPrompt.page ?? 'brand')}</strong>, or discard to go back to {appliedName ? <strong>{appliedName}</strong> : 'the applied set'}.
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={() => resolveNav('stay')}>Stay</button>
        <button className="ui-btn ui-btn--danger" onClick={() => resolveNav('discard')}>Discard</button>
        <button className="ui-btn ui-btn--primary" onClick={() => resolveNav('apply')} autoFocus>Apply to site</button>
      </div>
    </Modal>
  )
}
