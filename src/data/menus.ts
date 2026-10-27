import type { ColorRef, FooterCell, MenuLook, MenuSet, MenuText, PageId, SocialPlatform } from '../types'
import type { TokenKey } from './tokens'

// ---------- Navigation tree (shared by the sidebar, top bar and footer) ----------

export interface NavChild {
  id: PageId
  label: string
}

export interface NavItem {
  id: string
  label: string
  icon: string
  /** Parents with their own page go there on click. */
  page?: PageId
  children?: NavChild[]
}

export const NAV: NavItem[] = [
  { id: 'events', label: 'Upcoming events', icon: 'calendar', page: 'events' },
  { id: 'pairings', label: 'Pairings', icon: 'swap', page: 'pairings' },
  { id: 'players', label: 'All players', icon: 'users', page: 'players' },
  { id: 'profile', label: 'Profile', icon: 'user', page: 'profile' },
  {
    id: 'admin',
    label: 'Admin',
    icon: 'settings',
    children: [
      { id: 'brand', label: 'Brand' },
      { id: 'menu', label: 'Menu' },
      { id: 'documents', label: 'Document' },
    ],
  },
]

/** Every full page, in menu order. */
export const PAGES: NavChild[] = NAV.flatMap((n) => (n.page ? [{ id: n.page, label: n.label }] : n.children ?? []))

export const pageLabel = (id: PageId) => PAGES.find((p) => p.id === id)?.label ?? id

export const isActive = (item: NavItem, page: PageId) => item.page === page || !!item.children?.some((c) => c.id === page)

// ---------- Look schema ----------

export type LookKind = 'sidebar' | 'topbar' | 'footer'
export type SpacingKey = 'gap' | 'padX' | 'padY'

export interface RowDef {
  id: string
  name: string
  description: string
  sample: string
  spacing: { key: SpacingKey; label: string; max: number }[]
  def: MenuText
}

export interface ColorDef {
  key: string
  label: string
  desc: string
  light: ColorRef | null
  dark?: ColorRef
  /** Sidebar colours can follow a Components › Sidebar field (stored as null). */
  link?: string
}

export interface LayoutDef {
  key: string
  label: string
  desc: string
  def: number
  min: number
  max: number
}

const text = (style: string, patch: Partial<MenuText> = {}): MenuText => ({
  style, font: null, size: null, weight: null, uppercase: null, gap: 0, padX: 0, padY: 0, ...patch,
})

const t = (token: TokenKey, alpha = 100): ColorRef => ({ token, alpha })

export const ROW_DEFS: Record<LookKind, RowDef[]> = {
  sidebar: [
    {
      id: 'parent', name: 'Parent tabs', description: 'Upcoming events, Pairings, Profile, Admin', sample: 'Upcoming events',
      spacing: [{ key: 'gap', label: 'Space between tabs', max: 40 }, { key: 'padX', label: 'Side padding', max: 40 }, { key: 'padY', label: 'Top / bottom padding', max: 30 }],
      def: text('p1', { weight: 600, gap: 2, padX: 12, padY: 10 }),
    },
    {
      id: 'windowTitle', name: 'Window heading', description: 'Parent name at the top of the sub-tab window', sample: 'Parent tab',
      spacing: [{ key: 'padX', label: 'Side padding', max: 40 }, { key: 'padY', label: 'Top / bottom padding', max: 30 }],
      def: text('caption', { weight: 700, uppercase: true, padX: 12, padY: 6 }),
    },
    {
      id: 'sub', name: 'Sub tabs', description: 'Items in the sub-tab window', sample: 'Sub tab',
      spacing: [{ key: 'gap', label: 'Space between tabs', max: 40 }, { key: 'padX', label: 'Side padding', max: 40 }, { key: 'padY', label: 'Top / bottom padding', max: 30 }],
      def: text('p1', { gap: 2, padX: 12, padY: 8 }),
    },
  ],
  topbar: [
    {
      id: 'tab', name: 'Parent tabs', description: 'Tabs across the bar', sample: 'Upcoming events',
      spacing: [{ key: 'gap', label: 'Space between tabs', max: 80 }, { key: 'padX', label: 'Side padding', max: 40 }],
      def: text('p1', { weight: 600, gap: 20, padX: 6 }),
    },
    {
      id: 'sub', name: 'Dropdown sub tabs', description: 'Items in the dropdown under a parent tab', sample: 'Sub tab',
      spacing: [{ key: 'gap', label: 'Space between tabs', max: 40 }, { key: 'padX', label: 'Side padding', max: 40 }, { key: 'padY', label: 'Top / bottom padding', max: 30 }],
      def: text('p1', { gap: 2, padX: 12, padY: 8 }),
    },
  ],
  footer: [
    { id: 'heading', name: 'Column heading', description: 'First line of a column', sample: 'Design system', spacing: [], def: text('caption', { weight: 700, uppercase: true }) },
    { id: 'link', name: 'Page links', description: 'Links to pages', sample: 'Upcoming events', spacing: [], def: text('p1') },
    { id: 'text', name: 'Text & copyright', description: 'Custom text, links and the copyright line', sample: '© 2026 Principles', spacing: [], def: text('caption') },
  ],
}

export const COLOR_DEFS: Record<LookKind, ColorDef[]> = {
  sidebar: [
    { key: 'bg', label: 'Background', desc: 'The sidebar itself', light: null, link: 'bg' },
    { key: 'text', label: 'Tab text & icons', desc: 'Parent tabs', light: null, link: 'menuText' },
    { key: 'hover', label: 'Hover highlight', desc: 'Tab under the cursor', light: null, link: 'hover' },
    { key: 'selected', label: 'Selected highlight', desc: 'The page you are on', light: null, link: 'selected' },
    { key: 'selectedText', label: 'Selected text', desc: 'Text of the page you are on', light: null, link: 'selectedText' },
    { key: 'smallText', label: 'Small text', desc: 'Window heading, sub-title, footer note', light: null, link: 'smallText' },
    { key: 'divider', label: 'Divider lines', desc: 'Lines above and below the menu', light: null, link: 'divider' },
    { key: 'windowBg', label: 'Window background', desc: 'Sub-tab window', light: null, link: 'bg' },
    { key: 'windowText', label: 'Window text', desc: 'Sub tabs', light: null, link: 'menuText' },
    { key: 'windowHover', label: 'Window hover', desc: 'Sub tab under the cursor', light: null, link: 'hover' },
    { key: 'windowSelected', label: 'Window selected', desc: 'Sub tab of the page you are on', light: null, link: 'selected' },
    { key: 'windowBorder', label: 'Window border', desc: 'Outline of the window', light: null, link: 'divider' },
  ],
  topbar: [
    { key: 'bg', label: 'Background', desc: 'The bar itself', light: t('card'), dark: t('dark') },
    { key: 'text', label: 'Tab text', desc: 'Parent tabs', light: t('text'), dark: t('on-dark', 78) },
    { key: 'hover', label: 'Hover text', desc: 'Tab under the cursor', light: t('heading'), dark: t('on-dark') },
    { key: 'active', label: 'Current page text', desc: 'Tab of the page you are on', light: t('heading'), dark: t('on-dark') },
    { key: 'indicator', label: 'Current page line', desc: 'Line under the current tab', light: t('secondary'), dark: t('primary') },
    { key: 'divider', label: 'Bottom line', desc: 'Line under the bar', light: t('border'), dark: t('on-dark', 12) },
    { key: 'dropdownBg', label: 'Dropdown background', desc: 'Sub-tab dropdown', light: t('card'), dark: t('dark') },
    { key: 'dropdownText', label: 'Dropdown text', desc: 'Sub tabs', light: t('text'), dark: t('on-dark', 78) },
    { key: 'dropdownHover', label: 'Dropdown hover', desc: 'Sub tab under the cursor', light: t('panel'), dark: t('on-dark', 8) },
    { key: 'dropdownBorder', label: 'Dropdown border', desc: 'Outline of the dropdown', light: t('border'), dark: t('on-dark', 14) },
  ],
  footer: [
    { key: 'bg', label: 'Background', desc: 'The footer itself', light: t('panel'), dark: t('dark') },
    { key: 'heading', label: 'Column headings', desc: 'First line of a column', light: t('heading'), dark: t('on-dark') },
    { key: 'link', label: 'Links', desc: 'Page links and custom links', light: t('text'), dark: t('on-dark', 78) },
    { key: 'linkHover', label: 'Link hover', desc: 'Link under the cursor', light: t('heading'), dark: t('on-dark') },
    { key: 'text', label: 'Text', desc: 'Custom text and copyright', light: t('muted'), dark: t('on-dark', 60) },
    { key: 'icon', label: 'Social icons', desc: 'Icon colour', light: t('muted'), dark: t('on-dark', 78) },
    { key: 'divider', label: 'Top line', desc: 'Line above the footer', light: t('border'), dark: t('on-dark', 12) },
  ],
}

export const LAYOUT_DEFS: Record<LookKind, LayoutDef[]> = {
  sidebar: [
    { key: 'expandedWidth', label: 'Expanded width', desc: 'Sidebar with tab names', def: 232, min: 160, max: 360 },
    { key: 'collapsedWidth', label: 'Icon width', desc: 'Sidebar showing icons only', def: 64, min: 48, max: 120 },
  ],
  topbar: [
    { key: 'height', label: 'Bar height', desc: 'Height of the top bar', def: 60, min: 40, max: 120 },
    { key: 'padX', label: 'Side padding', desc: 'Space at the left and right ends', def: 24, min: 0, max: 80 },
  ],
  footer: [
    { key: 'padY', label: 'Top / bottom padding', desc: 'Space above and below the grid', def: 40, min: 0, max: 120 },
    { key: 'padX', label: 'Side padding', desc: 'Space at the left and right', def: 32, min: 0, max: 120 },
    { key: 'colGap', label: 'Space between columns', desc: 'Gap between columns', def: 40, min: 0, max: 120 },
    { key: 'rowGap', label: 'Space between rows', desc: 'Gap between rows in a column', def: 10, min: 0, max: 40 },
  ],
}

export function lookDefault(kind: LookKind, version: 'light' | 'dark' = 'light'): MenuLook {
  return {
    rows: Object.fromEntries(ROW_DEFS[kind].map((r) => [r.id, { ...r.def }])),
    colors: Object.fromEntries(COLOR_DEFS[kind].map((c) => [c.key, version === 'dark' ? c.dark ?? c.light : c.light])),
    layout: Object.fromEntries(LAYOUT_DEFS[kind].map((l) => [l.key, l.def])),
  }
}

// ---------- Footer ----------

export const SOCIALS: { platform: SocialPlatform; label: string }[] = [
  { platform: 'x', label: 'X' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'linkedin', label: 'LinkedIn' },
  { platform: 'facebook', label: 'Facebook' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'github', label: 'GitHub' },
]

export const CELL_KINDS: { kind: Exclude<FooterCell['kind'], 'empty' | 'page'>; label: string; icon: string }[] = [
  { kind: 'heading', label: 'Column heading', icon: 'heading' },
  { kind: 'text', label: 'Text / link', icon: 'link' },
  { kind: 'logo', label: 'Logo', icon: 'brand' },
  { kind: 'copyright', label: 'Copyright', icon: 'copyright' },
  { kind: 'social', label: 'Social icons', icon: 'instagram' },
]

export function newCell(kind: FooterCell['kind']): FooterCell {
  switch (kind) {
    case 'heading': return { kind, text: 'Heading' }
    case 'text': return { kind, text: 'Text', url: '' }
    case 'copyright': return { kind, text: `© ${new Date().getFullYear()} Principles` }
    case 'page': return { kind, page: 'brand' }
    default: return { kind } as FooterCell
  }
}

const col = (id: string, cells: FooterCell[]) => ({ id, cells })

function builtinMenu(): MenuSet {
  return {
    id: 'menu-default',
    name: 'Default',
    builtin: true,
    sidebar: { enabled: true, subOpen: 'hover', mode: 'fixed', look: lookDefault('sidebar') },
    topbar: { enabled: false, reversed: false, light: lookDefault('topbar', 'light'), dark: lookDefault('topbar', 'dark') },
    footer: {
      enabled: false,
      reversed: false,
      columns: [
        col('col-1', [{ kind: 'logo' }, { kind: 'text', text: 'One place for brand and UI specs.', url: '' }, { kind: 'empty' }, { kind: 'social' }]),
        col('col-2', [{ kind: 'heading', text: 'Design system' }, { kind: 'page', page: 'brand' }, { kind: 'page', page: 'menu' }]),
        col('col-3', [{ kind: 'heading', text: 'Club' }, { kind: 'page', page: 'events' }]),
        col('col-4', [{ kind: 'heading', text: 'About' }, { kind: 'text', text: 'Saved in this browser', url: '' }, { kind: 'copyright', text: `© ${new Date().getFullYear()} Principles` }]),
      ],
      socials: SOCIALS.map((s, i) => ({ platform: s.platform, url: '', on: i < 3 })),
      light: lookDefault('footer', 'light'),
      dark: lookDefault('footer', 'dark'),
    },
  }
}

export function builtinMenus(): MenuSet[] {
  return [builtinMenu()]
}
