import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { builtinBackgrounds } from '../data/backgrounds'
import { builtinLogos } from '../data/logos'
import { builtinEvents } from '../data/events'
import { builtinMenus } from '../data/menus'
import { builtinPages, normalizePages, pageAssets } from '../data/pages'
import { SITE_DEFAULTS } from '../data/siteDefaults'
import { builtinPalettes } from '../data/palettes'
import { builtinTypography } from '../data/typography'
import { collectGarbage } from '../lib/db'
import { IS_PREVIEW } from '../layout/MobilePreview'
import { ApiError, apiGet, apiPost, LOCAL_ONLY } from '../lib/api'
import { ALL_GRANTS, allows, type Grants } from '../data/permissions'
import type { Applied, BarVersion, BrandTab, CalEvent, MenuTab, PageId, Profile, SavedState, SliceKey, Slices } from '../types'
import { nextOp, runOp, type DocItem, type ServerState, type SessionUser } from './sync'

/** This browser's own data from before the server (kept for Admin › User management › Import). Used as-is in local-only mode. */
export const STORAGE_KEY = 'principles:brand:v1'
/** The last state the server sent: shown at start-up and when the server can't be reached (read-only). */
const CACHE_KEY = 'principles:server-cache:v1'
const UI_KEY = 'principles:ui:v1'

type Item = Slices[SliceKey][number]

export function builtinSlices(): Slices {
  // Saved site defaults take the place of the app's own starting sets.
  const d = structuredClone(SITE_DEFAULTS)
  return {
    palettes: d.palettes ?? builtinPalettes(),
    typography: d.typography ?? builtinTypography(),
    backgrounds: d.backgrounds ?? builtinBackgrounds(),
    logos: d.logos ?? builtinLogos(),
    menus: d.menus ?? builtinMenus(),
    events: builtinEvents().map((b) => ({ ...b, ...d.calendar })),
    pages: (d.pages ?? builtinPages()).map(normalizePages),
  }
}

const PAGE_IDS: PageId[] = ['home', 'contact', 'brand', 'menu', 'pages', 'documents', 'players', 'events', 'byes', 'profile', 'users', 'approvals', 'enquiries', 'emails']

const SLICES: SliceKey[] = ['palettes', 'typography', 'backgrounds', 'logos', 'menus', 'events', 'pages']

export function builtinItem<K extends SliceKey>(slice: K, id: string): Slices[K][number] | undefined {
  return (builtinSlices()[slice] as Item[]).find((i) => i.id === id) as Slices[K][number] | undefined
}

const DEFAULT_APPLIED: Applied = { palette: 'lime-black', typography: 'typography-1', background: 'bg-dots', logos: 'logo-monogram', menu: 'menu-default', events: 'events-default', pages: 'pages-default', ...SITE_DEFAULTS.applied }

function freshSaved(): SavedState {
  return { version: 1, ...builtinSlices(), applied: DEFAULT_APPLIED }
}

/** This browser's own saved data (local-only mode, and what Import sends to the server). */
export function readBrowserData(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedState
    return parsed.version === 1 ? normalize(parsed) : null
  } catch {
    return null
  }
}

/** The server's state as the app's saved state (built-ins the server doesn't have yet are added). */
export function fromServer(s: ServerState): SavedState {
  return normalize({ version: 1, ...s.design, events: [s.book], pages: s.pages ? [s.pages] : [], applied: { ...DEFAULT_APPLIED, ...s.applied, events: s.book.id }, profile: s.profile ?? undefined })
}

function readCache(): ServerState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as ServerState) : null
  } catch {
    return null
  }
}

function initialSaved(): SavedState {
  if (LOCAL_ONLY) return readBrowserData() ?? freshSaved()
  const cache = readCache()
  if (cache) return fromServer(cache)
  // Not the sample events while the server's arrive.
  const fresh = freshSaved()
  return { ...fresh, events: fresh.events.map((b) => ({ ...b, events: [] })) }
}

/** Older saves brought up to date, and built-ins added in later versions of the app. */
function normalize(parsed: SavedState): SavedState {
  const b = builtinSlices()
  const fresh = freshSaved()
  {
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
    return { ...fresh, ...parsed, pages: parsed.pages.map(normalizePages), applied: { ...fresh.applied, ...parsed.applied } }
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
export type GuardReason = 'menu' | 'events' | 'pages' | 'profile' | 'details' | 'entries'

export type PreviewMode = 'full' | 'compact' | 'small' | 'hidden'

function initialUi(saved: SavedState): UiState {
  const fresh: UiState = {
    page: 'home',
    tab: 'palette',
    menuTab: 'sidebar',
    menuVersion: { topbar: 'light', footer: 'light' },
    selected: {
      palettes: saved.applied.palette, typography: saved.applied.typography, backgrounds: saved.applied.background, logos: saved.applied.logos, menus: saved.applied.menu, events: saved.applied.events, pages: saved.applied.pages,
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
  if (!PAGE_IDS.includes(ui.page)) ui.page = 'home'
  if (!TABS.includes(ui.tab)) ui.tab = 'palette'
  // A preview of an unapplied menu set doesn't survive a reload.
  ui.selected.menus = saved.applied.menu
  const fromHash = parseHash(window.location.hash.slice(1))
  // Opening the site with no page in the address lands on Home.
  return fromHash ? { ...ui, ...fromHash } : { ...ui, page: 'home', eventId: null, eventEdit: false, eventEntries: false }
}

const TABS: BrandTab[] = ['palette', 'logos', 'typography', 'components']
const MENU_TABS: MenuTab[] = ['sidebar', 'topbar', 'footer']
const CONTENT_PAGES: PageId[] = ['home', 'contact', 'pages', 'documents', 'players', 'events', 'byes', 'profile', 'users', 'approvals', 'enquiries', 'emails']

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

export function referencedAssets(s: SavedState): Set<string> {
  const ids = new Set<string>()
  if (s.profile?.photo) ids.add(s.profile.photo.assetId)
  for (const b of s.backgrounds) {
    if (b.image.assetId) ids.add(b.image.assetId)
    if (b.video.assetId) ids.add(b.video.assetId)
  }
  for (const l of s.logos) for (const slot of Object.values(l.slots)) if (slot?.kind === 'asset') ids.add(slot.assetId)
  for (const p of s.pages) for (const id of pageAssets(p)) ids.add(id)
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

/** local = no server (VITE_LOCAL_ONLY); loading / offline = showing the last copy, read-only. */
export type SessionStatus = 'local' | 'loading' | 'online' | 'offline'

/** What can still be done without the server: looking at pages. */
const READ_ONLY_GRANTS = /^(page\.(home|contact|events|byes|players|profile|documents)|events\.viewEntries|profile\.tournaments)$/

export interface Session {
  status: SessionStatus
  /** Signed-in user; null = visitor. */
  user: SessionUser | null
  grants: Grants
  readOnly: boolean
  /** Changes are being sent to the server. */
  syncing: boolean
  /** Latest message for a toast (sent for approval, refused…). */
  notice: { text: string; nonce: number } | null
  /** No accounts yet: the first sign-up becomes the Admin. */
  setup: boolean
  documents: DocItem[]
  /** Arbiters a TO can assign. */
  arbiters: { id: number; name: string }[]
  accountPlayerIds: string[]
  pendingApprovals: number
  playersVisible: boolean
  /** Allowed? Scoped permissions check the event (own / assigned); without one, "for some event". */
  can: (key: string, event?: CalEvent | null) => boolean
  /** The change waits for an admin's approval. */
  needsApproval: (key: string, event?: CalEvent | null) => boolean
  refresh: () => Promise<void>
  say: (text: string) => void
  setDocuments: (docs: DocItem[]) => void
  login: (login: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const SessionCtx = createContext<Session | null>(null)

export function useSession() {
  const s = useContext(SessionCtx)
  if (!s) throw new Error('useSession must be used inside BrandStoreProvider')
  return s
}

const APPLIED_KEY: Record<SliceKey, keyof Applied> = { palettes: 'palette', typography: 'typography', backgrounds: 'background', logos: 'logos', menus: 'menu', events: 'events', pages: 'pages' }

export function BrandStoreProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<SavedState>(initialSaved)
  const [draft, setDraft] = useState<Slices>(() => {
    const { palettes, typography, backgrounds, logos, menus, events, pages } = saved
    return structuredClone({ palettes, typography, backgrounds, logos, menus, events, pages })
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

  // ---------- The server (MySQL via the API) ----------

  const [server, setServer] = useState<ServerState | null>(() => (LOCAL_ONLY ? null : readCache()))
  const [status, setStatus] = useState<SessionStatus>(LOCAL_ONLY ? 'local' : 'loading')
  const [notice, setNotice] = useState<Session['notice']>(null)
  const [syncing, setSyncing] = useState(false)
  /** What the server has: saved is compared with it, and the differences are sent. */
  const snap = useRef<SavedState | null>(null)
  const busy = useRef(false)
  const serverRef = useRef(server)
  serverRef.current = server
  const statusRef = useRef(status)
  statusRef.current = status
  const say = useCallback((text: string) => setNotice((n) => ({ text, nonce: (n?.nonce ?? 0) + 1 })), [])

  /** Takes the server's state: saved and the snapshot become it; drafts with unsaved edits are kept. */
  const adopt = useCallback((s: ServerState) => {
    const next = fromServer(s)
    snap.current = next
    setServer(s)
    setSaved(next)
    // Read now: the updater below runs after savedRef has moved on to `next`.
    const before = savedRef.current
    setDraft((d) => {
      const out = { ...d }
      for (const k of SLICES) {
        const wasDirty = JSON.stringify(d[k]) !== JSON.stringify(before[k])
        if (k === 'events') out.events = next.events.map((b) => ({ ...b, view: wasDirty ? d.events.find((x) => x.id === b.id)?.view ?? b.view : b.view }))
        else if (!wasDirty) (out as Record<SliceKey, unknown>)[k] = structuredClone(next[k])
      }
      return out
    })
    savedRef.current = next
  }, [])

  const refresh = useCallback(async () => {
    if (LOCAL_ONLY) return
    try {
      const s = await apiGet<ServerState>('state')
      adopt(s)
      setStatus('online')
    } catch (e) {
      setStatus('offline')
      if (e instanceof ApiError && e.status >= 500) say(e.message)
    }
  }, [adopt, say])

  useEffect(() => {
    // The phone preview only reads – it reloads when the main window's copy changes.
    if (LOCAL_ONLY || IS_PREVIEW) {
      if (IS_PREVIEW && !LOCAL_ONLY) setStatus(serverRef.current ? 'online' : 'offline')
      return
    }
    refresh()
    // Offline: try again every 30 s and when the browser is back online.
    const back = () => statusRef.current === 'offline' && refresh()
    const t = window.setInterval(back, 30000)
    window.addEventListener('online', back)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', back)
    }
  }, [refresh])

  /** Sends saved changes one by one until the server has them all. */
  const flush = useCallback(async () => {
    if (busy.current || statusRef.current !== 'online' || !snap.current) return
    busy.current = true
    setSyncing(true)
    try {
      for (;;) {
        const s = serverRef.current
        const op = nextOp(savedRef.current, snap.current!, { playersVisible: !!s?.playersVisible, signedIn: !!s?.user })
        if (!op) break
        try {
          const r = await runOp(op)
          snap.current = r.snap(snap.current!)
          if (r.saved) {
            const next = r.saved(savedRef.current)
            if (next !== savedRef.current) {
              savedRef.current = next
              setSaved(next)
              setDraft((d) => ({ ...d, events: next.events.map((b) => ({ ...b, view: d.events.find((x) => x.id === b.id)?.view ?? b.view })) }))
            }
          }
          if (r.notice) say(r.notice)
        } catch (e) {
          // Refused (no permission, someone else's change, signed out…): show why and take the server's copy.
          say(e instanceof Error ? e.message : 'Could not save to the server')
          if (e instanceof ApiError) await refresh()
          else setStatus('offline')
          break
        }
      }
    } finally {
      busy.current = false
      setSyncing(false)
    }
  }, [refresh, say])

  useEffect(() => {
    if (IS_PREVIEW) return
    if (LOCAL_ONLY) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
      } catch {
        // Storage full or blocked – keep working in memory.
      }
      return
    }
    if (status === 'online') flush()
    // Keep a copy for start-up and offline viewing (and the phone preview).
    const s = serverRef.current
    if (s)
      try {
        const { palettes, typography, backgrounds, logos, menus } = saved
        const cache: ServerState = { ...s, design: { palettes, typography, backgrounds, logos, menus }, applied: saved.applied, book: saved.events[0], pages: saved.pages[0], profile: saved.profile ?? null }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
      } catch {
        // Storage full or blocked.
      }
  }, [saved, status, flush])

  const session = useMemo<Session>(() => {
    const local = status === 'local'
    const user: SessionUser | null = local ? { id: 0, username: 'local', email: saved.profile?.email ?? '', role: 'admin', name: 'This browser', playerId: null } : server?.user ?? null
    // Offline / still loading: look, don't touch.
    const readOnly = status === 'offline' || status === 'loading'
    const base = local ? ALL_GRANTS : server?.grants ?? {}
    const grants: Grants = readOnly ? Object.fromEntries(Object.entries(base).filter(([k]) => READ_ONLY_GRANTS.test(k))) : base
    const who = { id: user?.id ?? null, grants }
    return {
      status, user, grants, readOnly, syncing, notice,
      setup: !local && !!server?.setup,
      documents: server?.documents ?? [],
      arbiters: server?.arbiters ?? [],
      accountPlayerIds: server?.accountPlayerIds ?? [],
      pendingApprovals: server?.pendingApprovals ?? 0,
      playersVisible: local || !!server?.playersVisible,
      can: (key, e) => allows(who, key, e) !== false,
      needsApproval: (key, e) => (allows(who, key, e) || { approval: false }).approval,
      refresh,
      say,
      setDocuments: (documents) => setServer((s) => s && { ...s, documents }),
      async login(login, password) {
        await apiPost('login', { login, password })
        await refresh()
      },
      async logout() {
        await apiPost('logout').catch(() => {})
        await refresh()
      },
    }
  }, [status, server, saved.profile?.email, syncing, notice, refresh, say])

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
  const pendingRef = useRef({ menu: menuPending, events: dirty.events, pages: dirty.pages })
  pendingRef.current = { menu: menuPending, events: dirty.events, pages: dirty.pages }

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
                : from === 'pages' && pendingRef.current.pages
                  ? 'pages'
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
      if (reason === 'events' || reason === 'pages') {
        if (choice === 'apply') save(reason)
        else discard(reason)
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
  return (
    <Ctx.Provider value={value}>
      <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>
    </Ctx.Provider>
  )
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

export { uid } from '../lib/uid'
