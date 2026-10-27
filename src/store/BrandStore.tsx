import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { builtinBackgrounds } from '../data/backgrounds'
import { builtinLogos } from '../data/logos'
import { builtinEvents } from '../data/events'
import { builtinMenus } from '../data/menus'
import { builtinPalettes } from '../data/palettes'
import { builtinTypography } from '../data/typography'
import { collectGarbage } from '../lib/db'
import { IS_PREVIEW } from '../layout/MobilePreview'
import type { Applied, BarVersion, BrandTab, MenuTab, PageId, Profile, SavedState, SliceKey, Slices } from '../types'

const STORAGE_KEY = 'principles:brand:v1'
const UI_KEY = 'principles:ui:v1'

type Item = Slices[SliceKey][number]

export function builtinSlices(): Slices {
  return { palettes: builtinPalettes(), typography: builtinTypography(), backgrounds: builtinBackgrounds(), logos: builtinLogos(), menus: builtinMenus(), events: builtinEvents() }
}

const PAGE_IDS: PageId[] = ['brand', 'menu', 'documents', 'players', 'events', 'pairings', 'profile']

const SLICES: SliceKey[] = ['palettes', 'typography', 'backgrounds', 'logos', 'menus', 'events']

export function builtinItem<K extends SliceKey>(slice: K, id: string): Slices[K][number] | undefined {
  return (builtinSlices()[slice] as Item[]).find((i) => i.id === id) as Slices[K][number] | undefined
}

function initialSaved(): SavedState {
  const b = builtinSlices()
  const fresh: SavedState = {
    version: 1,
    ...b,
    applied: { palette: 'lime-black', typography: 'typography-1', background: 'bg-dots', logos: 'logo-monogram', menu: 'menu-default', events: 'events-default' },
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const parsed = JSON.parse(raw) as SavedState
    if (parsed.version !== 1) return fresh
    // The single FIDE rating became Standard / Rapid / Blitz: the old one is the standard rating.
    const splitFide = (x: { fideRating?: string; fideStandard?: string }) => {
      if (x && 'fideRating' in x) {
        x.fideStandard ??= x.fideRating
        delete x.fideRating
      }
    }
    if (parsed.profile) splitFide(parsed.profile)
    for (const book of parsed.events ?? []) {
      for (const p of book.players ?? []) splitFide(p)
      for (const e of book.events) for (const x of e.entries ?? []) splitFide(x)
    }
    // Bring in built-ins added in later versions of the app.
    // Footer links to pages that no longer exist become empty cells.
    for (const m of parsed.menus ?? [])
      for (const c of m.footer?.columns ?? []) c.cells = c.cells.map((x) => (x.kind === 'page' && !PAGE_IDS.includes(x.page) ? { kind: 'empty' } : x))
    for (const k of Object.keys(b) as SliceKey[]) {
      parsed[k] ??= [] as never
      const have = new Set((parsed[k] as Item[]).map((i) => i.id))
      for (const item of b[k] as Item[]) if (!have.has(item.id)) (parsed[k] as Item[]).push(item)
    }
    return { ...fresh, ...parsed, applied: { ...fresh.applied, ...parsed.applied } }
  } catch {
    return fresh
  }
}

interface UiState {
  page: PageId
  tab: BrandTab
  menuTab: MenuTab
  /** Version being edited in the Top bar / Footer tabs; the site previews it while that tab is open. */
  menuVersion: Record<'topbar' | 'footer', BarVersion>
  selected: Record<SliceKey, string>
  previewMode: PreviewMode
  /** Upcoming events: the event whose details page is open (null = calendar), and whether it's being edited. */
  eventId: string | null
  eventEdit: boolean
  /** The tournament's All entries page (#events/<id>/entries). */
  eventEntries: boolean
}

export type NavTarget = Partial<Pick<UiState, 'page' | 'tab' | 'menuTab' | 'eventId' | 'eventEdit' | 'eventEntries'>>
/** Why leaving was stopped – decides the prompt and what Apply / Discard do. */
export type GuardReason = 'menu' | 'events' | 'profile' | 'details' | 'entries'

export type PreviewMode = 'full' | 'compact' | 'small' | 'hidden'

function initialUi(saved: SavedState): UiState {
  const fresh: UiState = {
    page: 'brand',
    tab: 'palette',
    menuTab: 'sidebar',
    menuVersion: { topbar: 'light', footer: 'light' },
    selected: {
      palettes: saved.applied.palette, typography: saved.applied.typography, backgrounds: saved.applied.background, logos: saved.applied.logos, menus: saved.applied.menu, events: saved.applied.events,
    },
    previewMode: 'compact',
    eventId: null,
    eventEdit: false,
    eventEntries: false,
  }
  let ui = fresh
  try {
    const raw = localStorage.getItem(UI_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      ui = { ...fresh, ...parsed, selected: { ...fresh.selected, ...parsed.selected }, menuVersion: { ...fresh.menuVersion, ...parsed.menuVersion } }
    }
  } catch {
    /* ignore */
  }
  if (!PAGE_IDS.includes(ui.page)) ui.page = 'brand'
  // A preview of an unapplied menu set doesn't survive a reload.
  ui.selected.menus = saved.applied.menu
  const fromHash = parseHash(window.location.hash.slice(1))
  return fromHash ? { ...ui, ...fromHash } : ui
}

const TABS: BrandTab[] = ['palette', 'background', 'logos', 'typography', 'components']
const MENU_TABS: MenuTab[] = ['sidebar', 'topbar', 'footer']
const CONTENT_PAGES: PageId[] = ['documents', 'players', 'events', 'pairings', 'profile']

/** #palette … #components = Brand tabs, #menu/sidebar = Menu tabs, #events = a page. */
function parseHash(h: string): NavTarget | null {
  if (TABS.includes(h as BrandTab)) return { page: 'brand', tab: h as BrandTab }
  if (h === 'brand' || h === 'menu') return { page: h }
  if (h.startsWith('menu/') && MENU_TABS.includes(h.slice(5) as MenuTab)) return { page: 'menu', menuTab: h.slice(5) as MenuTab }
  const ev = h.match(/^events\/([\w-]+)(\/edit|\/entries)?$/)
  if (ev) return { page: 'events', eventId: ev[1], eventEdit: ev[2] === '/edit', eventEntries: ev[2] === '/entries' }
  if (CONTENT_PAGES.includes(h as PageId)) return { page: h as PageId, eventId: null, eventEdit: false, eventEntries: false }
  return null
}

export function hashFor(t: { page: PageId; tab: BrandTab; menuTab: MenuTab; eventId?: string | null; eventEdit?: boolean; eventEntries?: boolean }) {
  if (t.page === 'events' && t.eventId) return `events/${t.eventId}${t.eventEdit ? '/edit' : t.eventEntries ? '/entries' : ''}`
  return t.page === 'brand' ? t.tab : t.page === 'menu' ? `menu/${t.menuTab}` : t.page
}

function referencedAssets(s: SavedState): Set<string> {
  const ids = new Set<string>()
  if (s.profile?.photo) ids.add(s.profile.photo.assetId)
  for (const b of s.backgrounds) {
    if (b.image.assetId) ids.add(b.image.assetId)
    if (b.video.assetId) ids.add(b.video.assetId)
  }
  for (const l of s.logos) for (const slot of Object.values(l.slots)) if (slot?.kind === 'asset') ids.add(slot.assetId)
  return ids
}

export interface Focus {
  kind: 'component' | 'textStyle' | 'token'
  id: string
  nonce: number
}

interface Store {
  saved: SavedState
  draft: Slices
  ui: UiState
  focus: Focus | null
  dirty: Record<SliceKey, boolean>
  /** The sidebar is previewing a menu set that isn't applied (or has unsaved edits). */
  menuPending: boolean
  /** Where the user tried to leave the Menu page (unapplied menu) or Events page (unsaved events) for. */
  navPrompt: (NavTarget & { reason: GuardReason }) | null
  navigate: (t: NavTarget) => void
  resolveNav: (choice: 'apply' | 'discard' | 'stay') => void
  /** Saves the profile straight away. */
  saveProfile: (p: Profile) => void
  /** The Profile page reports unsaved edits so leaving it can ask first. */
  setProfileDirty: (dirty: boolean) => void
  /** The event details editor reports unsaved edits. */
  setDetailsDirty: (dirty: boolean) => void
  /** The All entries page: a save function while it has unsaved edits, null otherwise. */
  setEntriesGuard: (save: (() => boolean) | null) => void
  setTab: (t: BrandTab) => void
  select: (slice: SliceKey, id: string) => void
  setUi: (patch: Partial<UiState>) => void
  focusOn: (kind: Focus['kind'], id: string, tab: BrandTab) => void
  /** Edit an item in the draft. */
  update: <K extends SliceKey>(slice: K, id: string, fn: (item: Slices[K][number]) => Slices[K][number]) => void
  /** Edit an item in saved and draft at once – saved straight away (events, categories). */
  updateNow: <K extends SliceKey>(slice: K, id: string, fn: (item: Slices[K][number]) => Slices[K][number]) => void
  /** Structural changes apply to saved and draft at once. */
  addItem: <K extends SliceKey>(slice: K, item: Slices[K][number], index?: number) => void
  removeItem: (slice: SliceKey, id: string) => { item: Item; index: number } | null
  save: (slice: SliceKey) => void
  discard: (slice: SliceKey) => void
  apply: (slice: SliceKey, id: string) => void
}

const Ctx = createContext<Store | null>(null)

const APPLIED_KEY: Record<SliceKey, keyof Applied> = { palettes: 'palette', typography: 'typography', backgrounds: 'background', logos: 'logos', menus: 'menu', events: 'events' }

export function BrandStoreProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedState>(initialSaved)
  const [draft, setDraft] = useState<Slices>(() => {
    const { palettes, typography, backgrounds, logos, menus, events } = saved
    return structuredClone({ palettes, typography, backgrounds, logos, menus, events })
  })
  const [ui, setUiState] = useState<UiState>(() => initialUi(saved))
  const [focus, setFocus] = useState<Focus | null>(null)
  const [navPrompt, setNavPrompt] = useState<Store['navPrompt']>(null)
  const detailsDirty = useRef(false)
  /** Set while the All entries page has unsaved edits: saves them, returns false if they don't pass the checks. */
  const entriesGuard = useRef<(() => boolean) | null>(null)
  const setEntriesGuard = useCallback((save: (() => boolean) | null) => {
    entriesGuard.current = save
  }, [])
  const setDetailsDirty = useCallback((d: boolean) => {
    detailsDirty.current = d
  }, [])
  const profileDirty = useRef(false)
  const setProfileDirty = useCallback((d: boolean) => {
    profileDirty.current = d
  }, [])
  const uiRef = useRef(ui)
  uiRef.current = ui
  const nonce = useRef(0)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const savedRef = useRef(saved)
  savedRef.current = saved

  useEffect(() => {
    // The phone preview only reads – the main window owns storage.
    if (IS_PREVIEW) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      // Storage full or blocked – keep working in memory.
    }
  }, [saved])

  const hash = hashFor(ui)
  useEffect(() => {
    if (window.location.hash !== `#${hash}`) history.replaceState(null, '', `#${hash}`)
  }, [hash])

  useEffect(() => {
    if (IS_PREVIEW) return
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(ui))
    } catch {
      /* ignore */
    }
  }, [ui])

  useEffect(() => {
    if (!IS_PREVIEW) collectGarbage(referencedAssets(saved))
    // Only on first load: unsaved uploads from a previous session are orphans.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty = useMemo(() => {
    const d = {} as Record<SliceKey, boolean>
    for (const k of SLICES) d[k] = JSON.stringify(draft[k]) !== JSON.stringify(saved[k])
    return d
  }, [draft, saved])

  useEffect(() => {
    const any = Object.values(dirty).some(Boolean)
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    if (any) window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const menuPending = dirty.menus || ui.selected.menus !== saved.applied.menu
  const pendingRef = useRef({ menu: menuPending, events: dirty.events })
  pendingRef.current = { menu: menuPending, events: dirty.events }

  const go = useCallback((t: NavTarget) => {
    const u0 = uiRef.current
    // Choosing a page (from a menu) opens it at its start: the calendar, not an event.
    // An event view not named in the target is closed (details, editor, entries are one at a time).
    const next = t.page && !('eventId' in t) ? { eventId: null, eventEdit: false, eventEntries: false, ...t } : 'eventId' in t ? { eventEdit: false, eventEntries: false, ...t } : t
    if (
      (next.page && next.page !== u0.page) ||
      ('eventId' in next && next.eventId !== u0.eventId) ||
      ('eventEdit' in next && next.eventEdit !== u0.eventEdit) ||
      ('eventEntries' in next && next.eventEntries !== u0.eventEntries)
    )
      window.scrollTo(0, 0)
    setUiState((u) => ({ ...u, ...next }))
  }, [])

  const navigate = useCallback(
    (t: NavTarget) => {
      const u = uiRef.current
      const from = u.page
      const leavesPage = !!t.page && t.page !== from
      // Leaving the details editor: another page, another event, or back to viewing.
      const leavesEditor = u.eventEdit && (leavesPage || (t.page === 'events' && !('eventId' in t)) || ('eventId' in t && t.eventId !== u.eventId) || t.eventEdit === false)
      const leavesEntries =
        u.eventEntries && (leavesPage || (t.page === 'events' && !('eventId' in t)) || ('eventId' in t && t.eventId !== u.eventId) || (!t.eventEntries && 'eventId' in t))
      const reason: GuardReason | null =
        leavesEditor && detailsDirty.current
          ? 'details'
          : leavesEntries && entriesGuard.current
            ? 'entries'
          : !leavesPage
            ? null
            : from === 'menu' && pendingRef.current.menu
              ? 'menu'
              : from === 'events' && pendingRef.current.events
                ? 'events'
                : from === 'profile' && profileDirty.current
                  ? 'profile'
                  : null
      if (reason) {
        setNavPrompt({ ...t, reason })
        history.replaceState(null, '', `#${hashFor(u)}`)
      } else go(t)
    },
    [go],
  )

  useEffect(() => {
    const h = () => {
      const t = parseHash(window.location.hash.slice(1))
      if (t) navigate(t)
    }
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [navigate])

  const setUi = useCallback((patch: Partial<UiState>) => setUiState((u) => ({ ...u, ...patch })), [])
  const setTab = useCallback((tab: BrandTab) => setUiState((u) => ({ ...u, tab })), [])
  const select = useCallback((slice: SliceKey, id: string) => setUiState((u) => ({ ...u, selected: { ...u.selected, [slice]: id } })), [])
  const focusOn = useCallback((kind: Focus['kind'], id: string, tab: BrandTab) => {
    setUiState((u) => ({ ...u, tab }))
    setFocus({ kind, id, nonce: ++nonce.current })
  }, [])

  const update = useCallback<Store['update']>((slice, id, fn) => {
    setDraft((d) => ({ ...d, [slice]: (d[slice] as Item[]).map((i) => (i.id === id ? fn(i as never) : i)) }))
  }, [])

  const updateNow = useCallback<Store['updateNow']>((slice, id, fn) => {
    const map = <T extends { [k: string]: unknown }>(s: T) => ({ ...s, [slice]: (s[slice] as Item[]).map((i) => (i.id === id ? fn(i as never) : i)) })
    setSaved((s) => map(s as never))
    setDraft((d) => map(d as never))
  }, [])

  const addItem = useCallback<Store['addItem']>((slice, item, index) => {
    const insert = (list: Item[]) => {
      const copy = [...list]
      copy.splice(index ?? copy.length, 0, structuredClone(item))
      return copy
    }
    setSaved((s) => ({ ...s, [slice]: insert(s[slice] as Item[]) }))
    setDraft((d) => ({ ...d, [slice]: insert(d[slice] as Item[]) }))
    setUiState((u) => ({ ...u, selected: { ...u.selected, [slice]: item.id } }))
  }, [])

  const removeItem = useCallback<Store['removeItem']>(
    (slice, id) => {
      const list = draft[slice] as Item[]
      const index = list.findIndex((i) => i.id === id)
      if (index < 0) return null
      const item = list[index]
      setSaved((s) => {
        const next = { ...s, [slice]: (s[slice] as Item[]).filter((i) => i.id !== id) }
        const key = APPLIED_KEY[slice]
        if (s.applied[key] === id) next.applied = { ...s.applied, [key]: (next[slice] as Item[])[0].id }
        return next
      })
      setDraft((d) => ({ ...d, [slice]: (d[slice] as Item[]).filter((i) => i.id !== id) }))
      setUiState((u) => {
        if (u.selected[slice] !== id) return u
        const rest = list.filter((i) => i.id !== id)
        return { ...u, selected: { ...u.selected, [slice]: rest[Math.max(0, index - 1)].id } }
      })
      return { item, index }
    },
    [draft],
  )

  const save = useCallback((slice: SliceKey) => {
    setSaved((s) => ({ ...s, [slice]: structuredClone(draftRef.current[slice]) }))
  }, [])

  const discard = useCallback((slice: SliceKey) => {
    setDraft((d) => ({ ...d, [slice]: structuredClone(savedRef.current[slice]) }))
  }, [])

  const apply = useCallback((slice: SliceKey, id: string) => {
    setSaved((s) => ({ ...s, [slice]: structuredClone(draftRef.current[slice]), applied: { ...s.applied, [APPLIED_KEY[slice]]: id } }))
  }, [])

  const resolveNav = useCallback(
    (choice: 'apply' | 'discard' | 'stay') => {
      const target = navPrompt
      setNavPrompt(null)
      if (!target || choice === 'stay') return
      const { reason, ...to } = target
      if (reason === 'entries') {
        // Save runs the page's checks; if they fail, stay so the problems can be fixed.
        if (choice === 'apply' && !entriesGuard.current?.()) return
        entriesGuard.current = null
        return navigate(to)
      }
      if (reason === 'details') {
        detailsDirty.current = false
        return navigate(to)
      }
      if (reason === 'profile') {
        profileDirty.current = false
        return go(to)
      }
      if (reason === 'events') {
        if (choice === 'apply') save('events')
        else discard('events')
        return go(to)
      }
      const id = uiRef.current.selected.menus
      if (choice === 'apply') apply('menus', id)
      else {
        discard('menus')
        setUiState((u) => ({ ...u, selected: { ...u.selected, menus: savedRef.current.applied.menu } }))
      }
      go(to)
    },
    [navPrompt, apply, save, discard, go, navigate],
  )

  const saveProfile = useCallback((p: Profile) => setSaved((s) => ({ ...s, profile: structuredClone(p) })), [])

  const value: Store = { saved, draft, ui, focus, dirty, menuPending, navPrompt, navigate, resolveNav, saveProfile, setProfileDirty, setDetailsDirty, setEntriesGuard, setTab, select, setUi, focusOn, update, updateNow, addItem, removeItem, save, discard, apply }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBrand() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useBrand must be used inside BrandStoreProvider')
  return s
}

export function appliedKey(slice: SliceKey): keyof Applied {
  return APPLIED_KEY[slice]
}

/** The item selected in a tab, from the draft. */
export function useSelected<K extends SliceKey>(slice: K): Slices[K][number] {
  const { draft, ui } = useBrand()
  const list = draft[slice] as Item[]
  return (list.find((i) => i.id === ui.selected[slice]) ?? list[0]) as Slices[K][number]
}

export function useApplied<K extends SliceKey>(slice: K): Slices[K][number] {
  const { saved } = useBrand()
  const list = saved[slice] as Item[]
  return (list.find((i) => i.id === saved.applied[APPLIED_KEY[slice]]) ?? list[0]) as Slices[K][number]
}

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
