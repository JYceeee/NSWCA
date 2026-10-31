import { useState, type ReactNode } from 'react'
import { ItemHeader, ItemSwitcher, NewItemDialog, SaveBar, SectionTitle } from '../brand/shared'
import { Icon } from '../components/Icon'
import { PageHead } from '../site/PageHead'
import { useBrand, useSelected } from '../store/BrandStore'
import type { BarVersion, MenuSet, MenuTab, SidebarMode, SubOpen } from '../types'
import { FooterGridEditor } from './FooterGridEditor'
import { LookEditor } from './LookEditor'

const TABS: { id: MenuTab; label: string; icon: string }[] = [
  { id: 'sidebar', label: 'Side bar', icon: 'sidebar' },
  { id: 'topbar', label: 'Top bar', icon: 'topbar' },
  { id: 'footer', label: 'Footer', icon: 'footer' },
]

function duplicateMenu(src: MenuSet, id: string, name: string): MenuSet {
  return { ...src, id, name, builtin: false }
}

export function MenuPage() {
  const { ui, saved, navigate } = useBrand()
  const menu = useSelected('menus')
  const savedSet = saved.menus.find((m) => m.id === menu.id)
  const tabDirty = (t: MenuTab) => JSON.stringify(menu[t]) !== JSON.stringify(savedSet?.[t])

  return (
    <div className="brand-page">
      <PageHead page="menu" title="Menu">
        Side bar, top bar and footer – how they behave and look. This app’s own menus preview the set you are editing.
      </PageHead>
      <div className="menu-sticky">
        <div className="brand-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={ui.menuTab === t.id} className="brand-tab" onClick={() => navigate({ menuTab: t.id })}>
              <Icon name={t.icon} size={16} />
              {t.label}
              {tabDirty(t.id) && <span className="dirty-dot" title="Unsaved changes" />}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {ui.menuTab === 'sidebar' && <SidebarTab />}
        {ui.menuTab === 'topbar' && <BarTab area="topbar" />}
        {ui.menuTab === 'footer' && <BarTab area="footer" />}
      </div>
    </div>
  )
}

/** Set switcher, header (rename / apply / duplicate / delete) and save bar around a tab's editor. */
function MenuFrame({ children }: { children: ReactNode }) {
  const menu = useSelected('menus')
  const { menuPending } = useBrand()
  const [newFrom, setNewFrom] = useState<string | null>(null)
  return (
    <div className="tab-body">
      <ItemSwitcher slice="menus" onNew={() => setNewFrom(menu.id)} />
      {menuPending && (
        <div className="preview-note">
          <Icon name="sidebar" size={16} />
          <span>
            This app’s sidebar, top bar and footer are previewing <strong>{menu.name}</strong>. Apply it to the site to keep it – you’ll be asked before leaving
            this page.
          </span>
        </div>
      )}
      <div className="panel">
        <ItemHeader slice="menus" item={menu} onDuplicate={() => setNewFrom(menu.id)} />
        {children}
      </div>
      <SaveBar slice="menus" item={menu} />
      {newFrom && <NewItemDialog slice="menus" sourceId={newFrom} onClose={() => setNewFrom(null)} make={duplicateMenu} />}
    </div>
  )
}

function useMenuEdit() {
  const menu = useSelected('menus')
  const { update } = useBrand()
  const edit = <A extends 'sidebar' | 'topbar' | 'footer'>(area: A, patch: Partial<MenuSet[A]>) =>
    update('menus', menu.id, (m) => ({ ...m, [area]: { ...m[area], ...patch } }))
  return { menu, edit }
}

interface Option<T> {
  value: T
  title: string
  desc: string
  art: ReactNode
}

function OptionCards<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="option-cards" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'option-card option-card--on' : 'option-card'} onClick={() => onChange(o.value)}>
          <span className="option-art">{o.art}</span>
          <span className="option-text">
            <strong>{o.title}</strong>
            <span>{o.desc}</span>
          </span>
          <span className="option-radio" />
        </button>
      ))}
    </div>
  )
}

/** Tiny sidebar drawings for the option cards. */
function Art({ kind }: { kind: SidebarMode | SubOpen }) {
  const rail = <rect x="1" y="1" width="16" height="50" rx="3" className="art-bar" />
  const wide = <rect x="1" y="1" width="38" height="50" rx="3" className="art-bar" />
  const lines = (x: number, w: number) => [12, 20, 28].map((y) => <rect key={y} x={x} y={y} width={w} height="3" rx="1.5" className="art-line" />)
  const dots = [12, 20, 28].map((y) => <rect key={y} x="6" y={y - 1} width="6" height="5" rx="1.5" className="art-line" />)
  const win = (x: number, y: number) => <rect x={x} y={y} width="26" height="18" rx="3" className="art-win" />
  const cursor = (x: number, y: number) => <path d={`M${x} ${y}l7 3.5-3 1-1 3Z`} className="art-cursor" />
  return (
    <svg viewBox="0 0 84 52" width="84" height="52" aria-hidden>
      <rect x="0.5" y="0.5" width="83" height="51" rx="4" className="art-page" />
      {kind === 'hover' && (
        <>
          <rect x="1" y="1" width="38" height="50" rx="3" className="art-ghost" />
          {rail}
          {dots}
          {cursor(10, 34)}
        </>
      )}
      {kind === 'fixed' && (
        <>
          {wide}
          {lines(6, 26)}
        </>
      )}
      {kind === 'icons' && (
        <>
          {rail}
          {dots}
          {win(21, 16)}
        </>
      )}
      {kind === 'click' && (
        <>
          {wide}
          {lines(6, 26)}
          {win(44, 16)}
          <circle cx="30" cy="21.5" r="4" className="art-ring" />
        </>
      )}
    </svg>
  )
}

function SidebarTab() {
  const { menu, edit } = useMenuEdit()
  const sb = menu.sidebar
  const enabled = sb.enabled !== false
  return (
    <MenuFrame>
      <div className="menu-checks">
        <label className="check-card">
          <input type="checkbox" checked={enabled} onChange={(e) => edit('sidebar', { enabled: e.target.checked })} />
          <span>
            <strong>Enable</strong>
            <small>Show the sidebar on the site. When it’s off, phones still get the menu drawer.</small>
          </span>
        </label>
      </div>
      {!enabled && (
        <p className="menu-note">
          The sidebar is off. {menu.topbar.enabled ? 'The top bar is the site’s menu.' : 'The top bar is off too, so the site has no menu – enable one of them on the Top bar tab.'} You can still set
          the sidebar up below.
        </p>
      )}
      <SectionTitle>Parent & sub tabs</SectionTitle>
      <p className="menu-help">
        Parent tabs with sub tabs show them in a small pop-out window. Choose when it opens – the top bar’s dropdowns follow the same rule. (Admin has sub tabs: Brand and Menu.)
      </p>
      <OptionCards
        label="When the sub-tab window opens"
        value={sb.subOpen}
        onChange={(subOpen) => edit('sidebar', { subOpen })}
        options={[
          { value: 'hover', title: 'Land on the parent tab', desc: 'The window pops out when the cursor lands on the tab.', art: <Art kind="hover" /> },
          { value: 'click', title: 'Click the parent tab', desc: 'The window pops out on click. Tabs with their own page (Brand, Menu) go straight to it.', art: <Art kind="click" /> },
        ]}
      />
      <SectionTitle>Animation</SectionTitle>
      <OptionCards
        label="Sidebar animation"
        value={sb.mode}
        onChange={(mode) => edit('sidebar', { mode })}
        options={[
          {
            value: 'hover',
            title: 'Cursor landing',
            desc: 'Collapsed to icons. Expands over the page when the cursor lands on it; landing on a tab then opens its sub tabs.',
            art: <Art kind="hover" />,
          },
          { value: 'fixed', title: 'Fix', desc: 'Always expanded.', art: <Art kind="fixed" /> },
          { value: 'icons', title: 'Icon only', desc: 'Never expands. Sub tabs pop out from the icon.', art: <Art kind="icons" /> },
        ]}
      />
      <p className="menu-help">Try it on this app’s sidebar. On phones the sidebar stays a drawer with sub tabs listed under their parent.</p>
      <LookEditor kind="sidebar" look={sb.look} onChange={(look) => edit('sidebar', { look })} />
    </MenuFrame>
  )
}

function BarTab({ area }: { area: 'topbar' | 'footer' }) {
  const { menu, edit } = useMenuEdit()
  const { ui, setUi } = useBrand()
  const bar = menu[area]
  const version: BarVersion = bar.reversed ? ui.menuVersion[area] : 'light'
  const name = area === 'topbar' ? 'top bar' : 'footer'
  // Top bar versions share size and text; only colours are per version.
  const shared = area === 'topbar'
  const setVersion = (v: BarVersion) => setUi({ menuVersion: { ...ui.menuVersion, [area]: v } })

  return (
    <MenuFrame>
      <div className="menu-checks">
        <label className="check-card">
          <input type="checkbox" checked={bar.enabled} onChange={(e) => edit(area, { enabled: e.target.checked })} />
          <span>
            <strong>Enable</strong>
            <small>Show a {name} on the site{area === 'topbar' ? ' – full width, above the sidebar. The logo moves into it.' : ' – at the bottom of every page.'}</small>
          </span>
        </label>
        <label className="check-card">
          <input type="checkbox" checked={bar.reversed} onChange={(e) => edit(area, { reversed: e.target.checked })} />
          <span>
            <strong>Reversed / on dark</strong>
            <small>
              Keep a second version for dark backgrounds. The site uses it when the page area {area === 'topbar' ? 'behind the top bar' : 'just above the footer'} is dark.
            </small>
          </span>
        </label>
      </div>
      {!bar.enabled && <p className="menu-note">The {name} is off. Tick Enable to see it on the site – you can still set it up below.</p>}
      {bar.enabled && area === 'footer' && (
        <button className="ui-btn ui-btn--small menu-jump" onClick={() => document.querySelector('.app-footer')?.scrollIntoView({ behavior: 'smooth' })}>
          <Icon name="chevronDown" size={14} /> See the footer
        </button>
      )}
      {area === 'footer' && <FooterGridEditor footer={menu.footer} onChange={(patch) => edit('footer', patch)} />}
      {shared && <LookEditor kind="topbar" look={bar.light} onChange={(light) => edit('topbar', { light })} parts={['size', 'text']} />}
      {bar.reversed && (
        <div className="version-bar">
          <div className="segmented" role="tablist" aria-label="Version">
            {(['light', 'dark'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={version === v} className={version === v ? 'seg seg--on' : 'seg'} onClick={() => setVersion(v)}>
                <span className={`version-dot version-dot--${v}`} /> {v === 'light' ? 'On light' : 'On dark'}
              </button>
            ))}
          </div>
          <span className="muted small">
            {shared ? 'Size and text are shared – each version has its own colours. ' : ''}While you edit a version, the site’s {name} shows it.
          </span>
        </div>
      )}
      <LookEditor
        key={version}
        kind={area}
        version={version}
        look={bar[version]}
        onChange={(look) => edit(area, { [version]: look } as Partial<MenuSet[typeof area]>)}
        parts={shared ? ['colors'] : undefined}
      />
    </MenuFrame>
  )
}
