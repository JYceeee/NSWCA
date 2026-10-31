import { format, parseISO } from 'date-fns'
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { ADMIN_ONLY_PERMS, defaultMatrix, MATRIX_ROLES, PERM_GROUPS, ROLE_LABEL, SCOPE_LABEL, type Grant, type Matrix, type PermRow, type Role, type Scope } from '../data/permissions'
import { apiGet, apiPost, apiUpload } from '../lib/api'
import { listLocalAssets } from '../lib/db'
import { ProfileScreen } from '../profile/ProfilePage'
import { PageHead } from '../site/PageHead'
import { readBrowserData, useSession } from '../store/BrandStore'
import type { Profile } from '../types'

type Status = 'pending' | 'active' | 'disabled' | 'rejected'
interface UserRow {
  id: number
  username: string
  email: string
  role: Role
  name: string
  playerId: string | null
  status: Status
  createdAt: string
  lastLoginAt: string | null
}

const STATUS_LABEL: Record<Status, string> = { pending: 'Waiting for approval', active: 'Active', disabled: 'Disabled', rejected: 'Rejected' }
const ROLES: Role[] = ['admin', 'organiser', 'arbiter', 'member']

/** Server times are UTC "yyyy-MM-dd HH:mm:ss". */
export const when = (t: string | null) => (t ? format(parseISO(`${t.replace(' ', 'T')}Z`), 'd MMM yyyy, h:mm a') : '—')

type Tab = 'users' | 'permissions'

/** Admin › User management: accounts, their profiles, and what each role may do. */
export function UsersPage() {
  const session = useSession()
  const [tab, setTab] = useState<Tab>('users')
  const [log, setLog] = useState<{ userId?: number; name?: string } | null>(null)
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'users', label: 'Users', icon: 'users' },
    ...(session.can('users.permissions') ? [{ id: 'permissions' as Tab, label: 'Roles and permissions', icon: 'settings' }] : []),
  ]
  return (
    <div className="brand-page um-page">
      <PageHead page="users" title="User management" className="ap-head" actions={
        <div className="um-head-actions">
          {session.can('users.import') && <ImportButton />}
          {session.can('users.log') && (
            <button className="ui-btn" onClick={() => setLog({})}>
              <Icon name="listBullet" size={15} /> Log
            </button>
          )}
        </div>
      }>
        Accounts, their profiles and roles, and what each role can see and do.
      </PageHead>
      {tabs.length > 1 && (
        <div className="brand-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="brand-tab" onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'users' ? <UsersTab onLog={(u) => setLog({ userId: u.id, name: u.name })} /> : <PermissionsTab />}
      {log && <LogDialog userId={log.userId} name={log.name} onClose={() => setLog(null)} />}
    </div>
  )
}

// ---------- Users ----------

function UsersTab({ onLog }: { onLog: (u: UserRow) => void }) {
  const session = useSession()
  const { confirm, toast } = useDialogs()
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [open, setOpen] = useState<{ id: number; edit: boolean } | null>(null)
  const [creating, setCreating] = useState(false)
  const [link, setLink] = useState<{ title: string; link: string; mailed: boolean; email: string } | null>(null)

  const load = () =>
    apiGet<{ users: UserRow[] }>('users.list')
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const replace = (u: UserRow) => setUsers((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null)
  const act = async (fn: () => Promise<{ user?: UserRow }>, done: string) => {
    try {
      const r = await fn()
      if (r.user) replace(r.user)
      toast(done)
      session.refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    }
  }

  const reset = async (u: UserRow) => {
    if (!(await confirm({ title: `Reset ${u.name}’s password?`, message: `They’re emailed a one-time link to set a new one (${u.email}). Their current password keeps working until they do.`, confirmLabel: 'Send link' }))) return
    try {
      const r = await apiPost<{ link: string; mailed: boolean }>('users.reset', { id: u.id })
      setLink({ title: 'Password reset link', ...r, email: u.email })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    }
  }

  const disable = async (u: UserRow) => {
    const ok = await confirm({
      title: `Disable ${u.name}?`,
      message:
        'They can’t sign in or enter events. In tournaments they’ve entered, games already paired are won by their opponent (forfeit), and they’re left out of later rounds until you enable them again.',
      confirmLabel: 'Disable',
      danger: true,
    })
    if (ok) act(() => apiPost('users.disable', { id: u.id }), `${u.name} disabled`)
  }

  const q = query.trim().toLowerCase()
  const rows = (users ?? []).filter(
    (u) => (filter === 'all' || u.status === filter) && (!q || [u.name, u.username, u.email, String(u.id)].some((v) => v.toLowerCase().includes(q))),
  )
  const pending = (users ?? []).filter((u) => u.status === 'pending').length

  if (error) return <p className="acct-error">{error}</p>
  return (
    <>
      <div className="ae-toolbar">
        <div className="cal-search ap-search">
          <Icon name="search" size={15} />
          <input className="ui-input" placeholder="Search name, username, email or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="ui-input um-filter" value={filter} onChange={(e) => setFilter(e.target.value as Status | 'all')} aria-label="Show">
          <option value="all">All users</option>
          <option value="pending">Waiting for approval{pending ? ` (${pending})` : ''}</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="acct-spacer" />
        {session.can('users.create') && (
          <button className="ui-btn ui-btn--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} /> New user
          </button>
        )}
      </div>
      <div className="ae-wrap">
        <table className="ae-table um-table">
          <thead>
            <tr>
              {['User ID', 'Name', 'Username', 'Role', 'Status', 'Action'].map((h) => (
                <th key={h}>
                  <span className="ae-sort">{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="um-id">{u.id}</td>
                <td className="ap-last">{u.name}</td>
                <td>{u.username}</td>
                <td>
                  <span className={`um-role um-role--${u.role}`}>{ROLE_LABEL[u.role]}</span>
                </td>
                <td>
                  <span className={`um-status um-status--${u.status}`}>{STATUS_LABEL[u.status]}</span>
                </td>
                <td className="ap-actions">
                  {u.status === 'pending' && session.can('approvals.signups') ? (
                    <>
                      <button className="ui-btn ui-btn--small ui-btn--primary" onClick={() => act(() => apiPost('users.approve', { id: u.id }), `${u.name} approved`)}>
                        <Icon name="check" size={13} /> Approve
                      </button>
                      <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => act(() => apiPost('users.reject', { id: u.id }), `${u.name}’s sign-up rejected`)}>
                        Reject
                      </button>
                    </>
                  ) : null}
                  <button className="ui-btn ui-btn--small" onClick={() => setOpen({ id: u.id, edit: false })}>
                    View
                  </button>
                  <button className="ui-btn ui-btn--small" onClick={() => setOpen({ id: u.id, edit: true })}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  {session.can('users.resetPassword') && u.status === 'active' && (
                    <button className="ui-btn ui-btn--small" onClick={() => reset(u)}>
                      Reset password
                    </button>
                  )}
                  {session.can('users.disable') &&
                    u.id !== session.user?.id &&
                    (u.status === 'disabled' ? (
                      <button className="ui-btn ui-btn--small" onClick={() => act(() => apiPost('users.enable', { id: u.id }), `${u.name} enabled`)}>
                        Enable
                      </button>
                    ) : (
                      u.status === 'active' && (
                        <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => disable(u)}>
                          Disable
                        </button>
                      )
                    ))}
                  {session.can('users.log') && (
                    <button className="icon-btn" title={`Log for ${u.name}`} aria-label={`Log for ${u.name}`} onClick={() => onLog(u)}>
                      <Icon name="listBullet" size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users && !rows.length && (
              <tr>
                <td className="ae-empty muted" colSpan={6}>
                  No users match.
                </td>
              </tr>
            )}
            {!users && (
              <tr>
                <td className="ae-empty muted" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <UserDialog
          id={open.id}
          edit={open.edit}
          onSaved={(u) => {
            replace(u)
            session.refresh()
          }}
          onClose={() => setOpen(null)}
        />
      )}
      {creating && (
        <NewUserDialog
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false)
            load()
            setLink({ title: 'Account created', ...r })
          }}
        />
      )}
      {link && <LinkDialog {...link} onClose={() => setLink(null)} />}
    </>
  )
}

/** The emailed set-password link, shown too in case the email doesn't arrive. */
function LinkDialog({ title, link, mailed, email, onClose }: { title: string; link: string; mailed: boolean; email: string; onClose: () => void }) {
  const { toast } = useDialogs()
  return (
    <Modal title={title} onClose={onClose} width={520}>
      <div className="modal-body form">
        <p>{mailed ? `A one-time link to set their password was emailed to ${email}.` : `The email to ${email} couldn’t be sent – copy this link and send it to them yourself.`} It works once, for 48 hours.</p>
        <div className="um-link">
          <input className="ui-input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button
            className="ui-btn"
            onClick={() =>
              navigator.clipboard
                .writeText(link)
                .then(() => toast('Link copied'))
                .catch(() => toast('Select the link and copy it'))
            }
          >
            <Icon name="copy" size={14} /> Copy
          </button>
        </div>
      </div>
      <div className="modal-actions">
        <button className="ui-btn ui-btn--primary" onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </Modal>
  )
}

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (r: { link: string; mailed: boolean; email: string }) => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', email: '', role: 'organiser' as Role })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await apiPost<{ link: string; mailed: boolean }>('users.create', { username: f.username.trim(), email: f.email.trim(), role: f.role, profile: { firstName: f.firstName.trim(), lastName: f.lastName.trim() } })
      onCreated({ ...r, email: f.email.trim() })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="New user" onClose={onClose} width={500}>
      <form onSubmit={submit}>
        <div className="modal-body form">
          <div className="acct-two">
            <label className="form-row">
              First name
              <input className="ui-input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} required autoFocus />
            </label>
            <label className="form-row">
              Last name
              <input className="ui-input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} required />
            </label>
          </div>
          <label className="form-row">
            Username
            <input className="ui-input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required pattern="[A-Za-z0-9._\-]{3,64}" title="3–64 letters, numbers, dots, dashes or underscores" />
          </label>
          <label className="form-row">
            Email
            <input className="ui-input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
          </label>
          <label className="form-row">
            Role
            <select className="ui-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">They’re emailed a one-time link to set their own password.</p>
          {error && <p className="acct-error">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="ui-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ui-btn ui-btn--primary" disabled={busy}>
            Create user
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** A user's account details and full profile; Edit saves both (every changed field goes in the log). */
function UserDialog({ id, edit, onSaved, onClose }: { id: number; edit: boolean; onSaved: (u: UserRow) => void; onClose: () => void }) {
  const session = useSession()
  const { toast } = useDialogs()
  const [data, setData] = useState<{ user: UserRow; profile: Profile | null } | null>(null)
  const [account, setAccount] = useState<{ username: string; role: Role } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    apiPost<{ user: UserRow; profile: Profile | null }>('users.get', { id })
      .then((r) => {
        setData(r)
        setAccount({ username: r.user.username, role: r.user.role })
      })
      .catch((e) => setError(e.message))
  }, [id])

  const save = async (patch: { user?: Partial<UserRow>; profile?: Profile }) => {
    try {
      const r = await apiPost<{ user: UserRow; profile: Profile | null }>('users.save', { id, ...patch })
      setData(r)
      setAccount({ username: r.user.username, role: r.user.role })
      onSaved(r.user)
      toast('Saved')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    }
  }

  const accountDirty = !!data && !!account && (account.username !== data.user.username || account.role !== data.user.role)
  return (
    <Modal title={data ? data.user.name : 'User'} onClose={onClose} width={1000}>
      <div className="modal-body">
        {error && <p className="acct-error">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && account && (
          <>
            <section className="pf-card um-account">
              <h3>Account</h3>
              <dl className="um-account-grid">
                <div className="pf-row">
                  <dt>User ID</dt>
                  <dd>{data.user.id}</dd>
                </div>
                <div className="pf-row">
                  <dt>Username</dt>
                  <dd>{edit ? <input className="ui-input" value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} /> : data.user.username}</dd>
                </div>
                <div className="pf-row">
                  <dt>Role</dt>
                  <dd>
                    {edit ? (
                      <select className="ui-input" value={account.role} onChange={(e) => setAccount({ ...account, role: e.target.value as Role })}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABEL[data.user.role]
                    )}
                  </dd>
                </div>
                <div className="pf-row">
                  <dt>Status</dt>
                  <dd>{STATUS_LABEL[data.user.status]}</dd>
                </div>
                <div className="pf-row">
                  <dt>Email (sign in)</dt>
                  <dd>{data.user.email}</dd>
                </div>
                <div className="pf-row">
                  <dt>Signed up</dt>
                  <dd>{when(data.user.createdAt)}</dd>
                </div>
                <div className="pf-row">
                  <dt>Last signed in</dt>
                  <dd>{when(data.user.lastLoginAt)}</dd>
                </div>
              </dl>
              {edit && (
                <div className="um-account-save">
                  <span className="muted small">The sign-in email follows the profile’s email.</span>
                  <button className="ui-btn ui-btn--primary ui-btn--small" disabled={!accountDirty} onClick={() => save({ user: account })}>
                    Save account
                  </button>
                </div>
              )}
            </section>
            <div className="profile-page">
              <ProfileScreen key={data.user.id + String(edit)} value={data.profile} fallbackEmail={data.user.email} onSave={(p) => save({ profile: p })} setDirty={() => {}} canEdit={edit} canJoin={edit && session.user?.role === 'admin'} canEditDates={session.user?.role === 'admin'} tabs={[]} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- Log ----------

interface LogRow {
  id: number
  at: string
  action: string
  field: string | null
  old: string | null
  new: string | null
  actor: string
  targetId: number | null
  target: string | null
}

const ACTION_LABEL: Record<string, string> = {
  profile_edit: 'Profile edited',
  email_edit: 'Template edited',
  email_restore: 'Version restored',
  user_edit: 'Account edited',
  role_change: 'Role changed',
  disable: 'Disabled',
  enable: 'Enabled',
  password_reset: 'Password reset sent',
  approve: 'Sign-up approved',
  reject: 'Sign-up rejected',
  user_create: 'User created',
  permission_change: 'Permission changed',
  event_approve: 'Event approved',
  event_reject: 'Event rejected',
}

/** Every change admins made: profiles field by field (before → after), roles, disable / enable, resets, approvals, permissions. */
export function LogDialog({ userId, name, api = 'log', title, onClose }: { userId?: number; name?: string; api?: string; title?: string; onClose: () => void }) {
  const [rows, setRows] = useState<LogRow[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    apiPost<{ log: LogRow[] }>(api, userId ? { userId } : {})
      .then((r) => setRows(r.log))
      .catch((e) => setError(e.message))
  }, [api, userId])
  // The Email templates log has no users in it.
  const users = api === 'log'
  const q = query.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) => !q || [r.actor, r.target, r.field, r.old, r.new, ACTION_LABEL[r.action]].some((v) => v?.toLowerCase().includes(q)))
  return (
    <Modal title={title ?? (name ? `Log · ${name}` : 'Log')} onClose={onClose} width={1000}>
      <div className="modal-body">
        <div className="cal-search ap-search um-log-search">
          <Icon name="search" size={15} />
          <input className="ui-input" placeholder="Search the log" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {error && <p className="acct-error">{error}</p>}
        <div className="ie-table-wrap um-log-wrap">
          <table className="ie-table">
            <thead>
              <tr>
                <th>When</th>
                <th>By</th>
                {users && <th>User</th>}
                <th>Change</th>
                <th>Field</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="um-nowrap">{when(r.at)}</td>
                  <td>{r.actor}</td>
                  {users && <td>{r.target ?? <span className="muted">—</span>}</td>}
                  <td>{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td>{r.field ?? <span className="muted">—</span>}</td>
                  <td className="um-old">{r.old || <span className="muted">—</span>}</td>
                  <td className="um-new">{r.new || <span className="muted">—</span>}</td>
                </tr>
              ))}
              {rows && !shown.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    Nothing logged yet.
                  </td>
                </tr>
              )}
              {!rows && !error && (
                <tr>
                  <td colSpan={7} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="modal-actions">
        <button className="ui-btn ui-btn--primary" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </Modal>
  )
}

// ---------- Roles and permissions ----------

/** Columns, most access first. Admin comes before these and isn't stored. */
const SHOWN_ROLES = [...MATRIX_ROLES].reverse()

/** Permissions in rows (grouped by page), roles in columns. Simple rows: a tickbox. Scoped rows: tickbox + condition. */
function PermissionsTab() {
  const { toast, confirm } = useDialogs()
  const session = useSession()
  const [rows, setRows] = useState<PermRow[] | null>(null)
  const [saved, setSaved] = useState<Matrix | null>(null)
  const [draft, setDraft] = useState<Matrix | null>(null)
  const [error, setError] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    apiGet<{ rows: PermRow[]; matrix: Matrix }>('perms.get')
      .then((r) => {
        setRows(r.rows)
        setSaved(r.matrix)
        setDraft(structuredClone(r.matrix))
      })
      .catch((e) => setError(e.message))
  }, [])

  const groups = useMemo(() => {
    const order = [...PERM_GROUPS, ...new Set((rows ?? []).map((r) => r.group))].filter((g, i, a) => a.indexOf(g) === i)
    return order.sort((a, b) => a.localeCompare(b)).map((g) => ({ name: g, rows: (rows ?? []).filter((r) => r.group === g) })).filter((g) => g.rows.length)
  }, [rows])

  if (error) return <p className="acct-error">{error}</p>
  if (!rows || !draft || !saved) return <p className="muted">Loading…</p>

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const cell = (role: (typeof MATRIX_ROLES)[number], key: string): Grant => draft[role][key] ?? false
  const set = (role: (typeof MATRIX_ROLES)[number], key: string, v: Grant) => setDraft({ ...draft, [role]: { ...draft[role], [key]: v } })
  const changed = (role: (typeof MATRIX_ROLES)[number], key: string) => (saved[role][key] ?? false) !== (draft[role][key] ?? false)

  const save = async () => {
    setBusy(true)
    try {
      const r = await apiPost<{ matrix: Matrix }>('perms.put', { matrix: draft })
      setSaved(r.matrix)
      setDraft(structuredClone(r.matrix))
      toast('Permissions saved')
      session.refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
    }
  }
  const reset = async () => {
    if (!(await confirm({ title: 'Reset to the defaults?', message: 'Every role goes back to the permissions the site started with. Nothing changes until you Save.', confirmLabel: 'Reset' }))) return
    const d = defaultMatrix()
    // Keep only rows the server knows.
    setDraft(Object.fromEntries(MATRIX_ROLES.map((role) => [role, Object.fromEntries(rows.map((r) => [r.key, d[role][r.key] ?? false]))])) as Matrix)
  }
  const toggleGroup = (g: string) =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(g)) n.delete(g)
      else n.add(g)
      return n
    })

  return (
    <>
      <p className="muted um-perm-intro">
        Tick what each role can see and do. Rows with a condition show a dropdown once ticked: <strong>Own only</strong> = events they created, <strong>Assigned only</strong> = tournaments they’re an
        arbiter of, <strong>Needs approval</strong> = the change waits in Review and approval. Admin always has everything. Visitors are people who aren’t signed in.
      </p>
      <div className="ae-wrap um-perm-wrap">
        <table className="um-perm">
          <thead>
            <tr>
              <th className="um-perm-name">Permission / access</th>
              <th>Admin</th>
              {SHOWN_ROLES.map((r) => (
                <th key={r}>{ROLE_LABEL[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="um-perm-group">
                  <th colSpan={MATRIX_ROLES.length + 2}>
                    <button className="um-perm-toggle" aria-expanded={!closed.has(g.name)} onClick={() => toggleGroup(g.name)}>
                      <Icon name={closed.has(g.name) ? 'chevron' : 'chevronDown'} size={14} /> {g.name}
                      <span className="muted small">{g.rows.length}</span>
                    </button>
                  </th>
                </tr>
                {!closed.has(g.name) &&
                  g.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="um-perm-name">{row.label}</td>
                      <td className="um-perm-cell um-perm-cell--locked">
                        <div className="um-perm-ctl">
                          <input type="checkbox" checked disabled aria-label={`Admin: ${g.name} › ${row.label} (always)`} />
                          {row.scopes.length > 0 && <span className="muted small">All</span>}
                        </div>
                      </td>
                      {SHOWN_ROLES.map((role) => {
                        const v = cell(role, row.key)
                        const label = `${ROLE_LABEL[role]}: ${g.name} › ${row.label}`
                        return (
                          <td key={role} className={changed(role, row.key) ? 'um-perm-cell um-perm-cell--changed' : 'um-perm-cell'}>
                            <div className="um-perm-ctl">
                              <input type="checkbox" aria-label={label} checked={v !== false} disabled={ADMIN_ONLY_PERMS.has(row.key)} onChange={(e) => set(role, row.key, e.target.checked ? (row.scopes.length ? row.scopes[0] : true) : false)} />
                              {row.scopes.length > 0 && v !== false && (
                                <select className="ui-input um-perm-scope" aria-label={`${label} – condition`} value={typeof v === 'string' ? v : row.scopes[0]} onChange={(e) => set(role, row.key, e.target.value as Scope)}>
                                  {row.scopes.map((s) => (
                                    <option key={s} value={s}>
                                      {SCOPE_LABEL[s]}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="save-bar">
        <span className={dirty ? 'save-status save-status--dirty' : 'save-status'}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <button className="ui-btn" onClick={reset}>
          Reset to defaults
        </button>
        <button className="ui-btn" disabled={!dirty} onClick={() => setDraft(structuredClone(saved))}>
          Discard changes
        </button>
        <button className="ui-btn ui-btn--primary" disabled={!dirty || busy} onClick={save}>
          Save
        </button>
      </div>
    </>
  )
}

// ---------- Import ----------

/** Sends this browser's own data (from before the server) to MySQL: files first, then everything else. */
function ImportButton() {
  const { confirm, toast } = useDialogs()
  const session = useSession()
  const [busy, setBusy] = useState('')
  const run = async () => {
    const data = readBrowserData()
    if (!data) return toast('There’s no saved data from before in this browser.')
    const book = data.events[0]
    const ok = await confirm({
      title: 'Import this browser’s data?',
      message: `Copies what this browser saved before the server – ${book?.events.length ?? 0} events, ${book?.players?.length ?? 0} players, your brand and menu sets and your profile – into MySQL. Items with the same id are overwritten.`,
      confirmLabel: 'Import',
    })
    if (!ok) return
    try {
      const assets = await listLocalAssets().catch(() => [])
      const photo = data.profile?.photo?.assetId
      for (const [i, a] of assets.entries()) {
        setBusy(`Uploading files ${i + 1} / ${assets.length}…`)
        await apiUpload('upload', { id: a.id, kind: a.id === photo ? 'photo' : 'brand', file: a.blob }, a.name)
      }
      setBusy('Importing…')
      const r = await apiPost<{ imported: Record<string, number> }>('import', { state: data })
      await session.refresh()
      toast(`Imported ${r.imported.events} events, ${r.imported.players} players, ${r.imported.design} brand/menu sets and ${assets.length} files`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy('')
    }
  }
  return (
    <button className="ui-btn" disabled={!!busy} onClick={run} title="Copy what this browser saved before the server into MySQL">
      <Icon name="upload" size={15} /> {busy || 'Import browser data'}
    </button>
  )
}
