import { NAV, pageLabel, type NavItem } from '../data/menus'
import { useBrand, useSession } from '../store/BrandStore'
import type { PageId } from '../types'

/** A page's menu name: Page Config's label, or the standard one. */
export function usePageLabel() {
  const { saved } = useBrand()
  const heads = saved.pages[0].heads
  return (id: PageId) => heads[id]?.menuLabel.trim() || pageLabel(id)
}

/** The menu tree without the pages this role can't open (a parent with no sub tabs left is hidden too). */
export function useVisibleNav(): NavItem[] {
  const { can } = useSession()
  const label = usePageLabel()
  return NAV.flatMap((n) => {
    if (n.page) return can(`page.${n.page}`) ? [{ ...n, label: label(n.page) }] : []
    const children = (n.children ?? []).filter((c) => can(`page.${c.id}`)).map((c) => ({ ...c, label: label(c.id) }))
    return children.length ? [{ ...n, children }] : []
  })
}
