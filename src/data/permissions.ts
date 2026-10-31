// Roles and permissions: the rows of the matrix (permissions.json, shared with scripts/gen-seed.mjs)
// and the same checks the API makes (public/api/_perms.php).
import catalogue from './permissions.json'
import type { CalEvent } from '../types'

export type Role = 'admin' | 'organiser' | 'arbiter' | 'member'
/** Matrix columns: visitor = not signed in. Admin is always everything. */
export type MatrixRole = 'visitor' | 'member' | 'arbiter' | 'organiser'
export const MATRIX_ROLES: MatrixRole[] = ['visitor', 'member', 'arbiter', 'organiser']

export const ROLE_LABEL: Record<Role | 'visitor', string> = {
  admin: 'Admin',
  organiser: 'Tournament Organiser',
  arbiter: 'Arbiter',
  member: 'Member',
  visitor: 'Visitor',
}
export const ROLE_SHORT: Record<Role | 'visitor', string> = { admin: 'Admin', organiser: 'TO', arbiter: 'AB', member: 'Member', visitor: 'Visitor' }

export type Scope = 'all' | 'approval' | 'own' | 'own_approval' | 'assigned'
export const SCOPE_LABEL: Record<Scope, string> = {
  all: 'All',
  approval: 'Needs approval',
  own: 'Own only',
  own_approval: 'Own only, needs approval',
  assigned: 'Assigned only',
}

/** false = no, true = yes (simple row), or the condition of a scoped row. */
export type Grant = boolean | Scope
export type Grants = Record<string, Grant>
export type Matrix = Record<MatrixRole, Grants>

export interface PermRow {
  key: string
  group: string
  label: string
  /** Scoped rows: the condition choices. */
  scopes: Scope[]
}

type Raw = { key: string; group: string; label: string; scopes?: string[]; adminOnly?: boolean; d: Grant[] }
const raw = catalogue.rows as Raw[]

/** Rows only Admin can ever have: no role can be ticked. */
export const ADMIN_ONLY_PERMS = new Set(raw.filter((r) => r.adminOnly).map((r) => r.key))

export const PERM_GROUPS: string[] = catalogue.groups
export const PERM_ROWS: PermRow[] = raw.map((r) => ({ key: r.key, group: r.group, label: r.label, scopes: (r.scopes ?? []) as Scope[] }))

/** The matrix as it ships (Reset to defaults). */
export function defaultMatrix(): Matrix {
  const m = { visitor: {}, member: {}, arbiter: {}, organiser: {} } as Matrix
  for (const r of raw) MATRIX_ROLES.forEach((role, i) => (m[role][r.key] = r.d[i]))
  return m
}

export const ALL_GRANTS: Grants = Object.fromEntries(raw.map((r) => [r.key, true]))

/** Server-side event fields used for own / assigned. */
export interface EventMeta {
  status?: 'approved' | 'pending' | 'rejected'
  createdBy?: number | null
  arbiters?: number[]
  pendingChange?: boolean
}

export interface Who {
  id: number | null
  grants: Grants
}

export function eventCtx(who: Who, e?: CalEvent | null) {
  if (!e || who.id == null) return { own: false, assigned: false }
  return { own: e.createdBy === who.id, assigned: !!e.arbiters?.includes(who.id) }
}

/**
 * Is it allowed? Scoped rows check the event (own = created it, assigned = an arbiter of it).
 * With no event, a scoped permission counts as allowed if it could apply to some event (for showing a page or a button).
 */
export function allows(who: Who, key: string, e?: CalEvent | null): false | { approval: boolean } {
  const g = who.grants[key] ?? false
  if (g === false) return false
  if (g === true || g === 'all') return { approval: false }
  if (g === 'approval') return { approval: true }
  if (e === undefined) return { approval: g === 'own_approval' }
  const ctx = eventCtx(who, e)
  if (g === 'own') return ctx.own ? { approval: false } : false
  if (g === 'own_approval') return ctx.own ? { approval: true } : false
  if (g === 'assigned') return ctx.assigned ? { approval: false } : false
  return false
}
