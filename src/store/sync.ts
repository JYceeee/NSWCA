// Keeping the app's saved state and MySQL in step. The server's copy (the snapshot) is compared with what the
// app has saved; each difference is sent to the API one at a time, and the server's answer becomes the new snapshot.
import { apiPost } from '../lib/api'
import type { Grants } from '../data/permissions'
import type { Role } from '../data/permissions'
import type { Applied, CalEvent, CalViewSettings, EventBook, EventCategory, PageConfig, Player, Profile, SavedState, Slices } from '../types'

export interface SessionUser {
  id: number
  username: string
  email: string
  role: Role
  name: string
  playerId: string | null
}

export interface DocItem {
  id: string
  title: string
  description: string
  fileName: string
  mime: string
  size: number
  uploadId: string
  visibleTo: string[]
  createdAt: string
}

/** What api › state sends: everything this viewer may see. */
export interface ServerState {
  user: SessionUser | null
  /** No accounts yet: the first sign-up becomes the Admin. */
  setup: boolean
  grants: Grants
  design: Pick<Slices, 'palettes' | 'typography' | 'backgrounds' | 'logos' | 'menus'>
  applied: Applied | null
  book: EventBook
  /** Page Config; null until an admin first saves it. */
  pages: PageConfig | null
  /** The player list was sent (organisers, admins). */
  playersVisible: boolean
  profile: Profile | null
  documents: DocItem[]
  arbiters?: { id: number; name: string }[]
  /** Players that belong to an account (All players › Status = Member). */
  accountPlayerIds?: string[]
  pendingApprovals?: number
}

export const DESIGN_SLICES = ['palettes', 'typography', 'backgrounds', 'logos', 'menus'] as const
type DesignSlice = (typeof DESIGN_SLICES)[number]

type Op =
  | { kind: 'design'; slice: DesignSlice; item: Slices[DesignSlice][number]; index: number }
  | { kind: 'designDelete'; slice: DesignSlice; id: string }
  | { kind: 'applied'; value: Applied }
  | { kind: 'pages'; value: PageConfig }
  | { kind: 'view'; value: CalViewSettings }
  | { kind: 'bookName'; name: string }
  | { kind: 'categories'; list: EventCategory[] }
  | { kind: 'event'; base: CalEvent | null; next: CalEvent }
  | { kind: 'eventDelete'; id: string }
  | { kind: 'players'; base: Player[]; next: Player[] }
  | { kind: 'profile'; profile: Profile }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const bookOf = (s: SavedState) => s.events[0]

/** The first thing saved here that the server doesn't have yet. */
export function nextOp(saved: SavedState, snap: SavedState, opts: { playersVisible: boolean; signedIn: boolean }): Op | null {
  for (const slice of DESIGN_SLICES) {
    const was = new Map((snap[slice] as { id: string }[]).map((i) => [i.id, i]))
    const list = saved[slice] as Slices[DesignSlice][number][]
    for (const [index, item] of list.entries()) if (!same(item, was.get(item.id))) return { kind: 'design', slice, item, index }
    const now = new Set(list.map((i) => i.id))
    for (const id of was.keys()) if (!now.has(id)) return { kind: 'designDelete', slice, id }
  }
  if (!same(saved.applied, snap.applied)) return { kind: 'applied', value: saved.applied }
  if (saved.pages[0] && !same(saved.pages, snap.pages)) return { kind: 'pages', value: saved.pages[0] }
  const b = bookOf(saved)
  const sb = bookOf(snap)
  if (b && sb) {
    if (b.view && !same(b.view, sb.view)) return { kind: 'view', value: b.view }
    if (b.name !== sb.name) return { kind: 'bookName', name: b.name }
    if (!same(b.categories, sb.categories)) return { kind: 'categories', list: b.categories }
    const was = new Map(sb.events.map((e) => [e.id, e]))
    for (const e of b.events) if (!same(e, was.get(e.id))) return { kind: 'event', base: was.get(e.id) ?? null, next: e }
    const now = new Set(b.events.map((e) => e.id))
    for (const id of was.keys()) if (!now.has(id)) return { kind: 'eventDelete', id }
    // Players come after events: the server lists new entrants itself when an entry is saved.
    if (opts.playersVisible && b.players && !same(b.players, sb.players)) return { kind: 'players', base: sb.players ?? [], next: b.players }
  }
  if (opts.signedIn && saved.profile && !same(saved.profile, snap.profile)) return { kind: 'profile', profile: saved.profile }
  return null
}

/** Applies a change to one book in a saved state. */
const withBook = (s: SavedState, fn: (b: EventBook) => EventBook): SavedState => ({ ...s, events: s.events.map((b, i) => (i === 0 ? fn(b) : b)) })

export interface OpResult {
  /** The server now has this. */
  snap: (s: SavedState) => SavedState
  /** The server changed what was sent (ids filled in, pending…): saved takes its version, unless edited again meanwhile. */
  saved?: (s: SavedState) => SavedState
  /** Shown to the user, e.g. "sent for approval". */
  notice?: string
}

/** Sends one change; returns how the snapshot (and saved state) move on. Throws ApiError when refused. */
export async function runOp(op: Op): Promise<OpResult> {
  switch (op.kind) {
    case 'design': {
      await apiPost('design.put', { slice: op.slice, item: op.item, index: op.index })
      const put = (s: SavedState) => {
        const list = s[op.slice] as { id: string }[]
        const next = list.some((i) => i.id === op.item.id) ? list.map((i) => (i.id === op.item.id ? op.item : i)) : [...list, op.item]
        return { ...s, [op.slice]: next }
      }
      return { snap: put }
    }
    case 'designDelete':
      await apiPost('design.delete', { slice: op.slice, id: op.id })
      return { snap: (s) => ({ ...s, [op.slice]: (s[op.slice] as { id: string }[]).filter((i) => i.id !== op.id) }) }
    case 'applied':
      await apiPost('settings.put', { key: 'applied', value: op.value })
      return { snap: (s) => ({ ...s, applied: op.value }) }
    case 'pages':
      await apiPost('settings.put', { key: 'page_config', value: op.value })
      return { snap: (s) => ({ ...s, pages: [op.value] }) }
    case 'view':
      await apiPost('settings.put', { key: 'calendar_view', value: op.value })
      return { snap: (s) => withBook(s, (b) => ({ ...b, view: op.value })) }
    case 'bookName':
      await apiPost('settings.put', { key: 'event_book', value: { name: op.name } })
      return { snap: (s) => withBook(s, (b) => ({ ...b, name: op.name })) }
    case 'categories': {
      const r = await apiPost<{ categories: EventCategory[] }>('categories.put', { categories: op.list })
      return {
        snap: (s) => withBook(s, (b) => ({ ...b, categories: r.categories })),
        saved: (s) => withBook(s, (b) => (same(b.categories, op.list) ? { ...b, categories: r.categories } : b)),
      }
    }
    case 'event': {
      const r = await apiPost<{ event: CalEvent; pending: boolean }>('event.put', { base: op.base, next: op.next })
      const put = (list: CalEvent[]) => (list.some((e) => e.id === r.event.id) ? list.map((e) => (e.id === r.event.id ? r.event : e)) : [...list, r.event])
      return {
        snap: (s) => withBook(s, (b) => ({ ...b, events: put(b.events) })),
        saved: (s) => withBook(s, (b) => (same(b.events.find((e) => e.id === op.next.id), op.next) ? { ...b, events: put(b.events) } : b)),
        notice: r.pending
          ? op.base
            ? `Your changes to ${op.next.name || 'the event'} were sent to an admin for approval. The current version stays up until then.`
            : `${op.next.name || 'The event'} was sent to an admin for approval.`
          : undefined,
      }
    }
    case 'eventDelete':
      await apiPost('event.delete', { id: op.id })
      return { snap: (s) => withBook(s, (b) => ({ ...b, events: b.events.filter((e) => e.id !== op.id) })) }
    case 'players': {
      const r = await apiPost<{ players: Player[] }>('players.put', { base: op.base, next: op.next })
      return {
        snap: (s) => withBook(s, (b) => ({ ...b, players: r.players })),
        saved: (s) => withBook(s, (b) => (same(b.players, op.next) ? { ...b, players: r.players } : b)),
      }
    }
    case 'profile': {
      const r = await apiPost<{ profile: Profile }>('profile', { profile: op.profile })
      return { snap: (s) => ({ ...s, profile: r.profile }), saved: (s) => (same(s.profile, op.profile) ? { ...s, profile: r.profile } : s) }
    }
  }
}
