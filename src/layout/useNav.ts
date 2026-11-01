import { NAV, pageLabel, type NavItem } from '../data/menus'
import { IS_PREVIEW } from './MobilePreview'
import { useBrand, useSession } from '../store/BrandStore'
import type { PageId } from '../types'

/** This tab is the website, opened from the admin portal's View website link. */
export const IS_SITE_TAB = new URLSearchParams(window.location.search).has('site')

/** Where an admin works: side bar only. Local-only mode has no accounts, so it stays the site. */
export function useAdminPortal() {
  const { user, status } = useSession()
  return user?.role === 'admin' && status !== 'local' && !IS_SITE_TAB && !IS_PREVIEW
}

/** The website tab, or any tab that isn't the portal, moves to the portal. */
export function goToPortal() {
  window.location.href = `${window.location.pathname}#approvals`
}

/** A page's menu name: Page Config's label, or the standard one. */
export function usePageLabel() {
  const { saved } = useBrand()
  const heads = saved.pages[0].heads
  return (id: PageId) => heads[id]?.menuLabel.trim() || pageLabel(id)
}

/** The menu tree without the pages this role can't open (a parent with no sub tabs left is hidden too). */
export function useVisibleNav(): NavItem[] {
  const { can, user } = useSession()
  const label = usePageLabel()
  return NAV.flatMap((n) => {
    // Admins reach these pages through the portal.
    if (n.id === 'admin' && user?.role === 'admin') return []
    if (n.page) return can(`page.${n.page}`) ? [{ ...n, label: label(n.page) }] : []
    const children = (n.children ?? []).filter((c) => can(`page.${c.id}`)).map((c) => ({ ...c, label: label(c.id) }))
    return children.length ? [{ ...n, children }] : []
  })
}
