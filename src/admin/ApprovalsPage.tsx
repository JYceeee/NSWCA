import { useEffect, useState } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { SECTIONS } from '../data/eventDetails'
import { dateRangeLabel, timeLabel } from '../data/events'
import { apiGet, apiPost } from '../lib/api'
import { PageHead } from '../site/PageHead'
import { useBrand, useSession } from '../store/BrandStore'
import type { CalEvent, Profile } from '../types'
import { when } from './UsersPage'

interface Approval {
  id: number
  kind: 'event_new' | 'event_change' | 'member_signup'
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  submittedBy: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  note: string | null
  event?: CalEvent | null
  /** event_change: the proposed event fields. */
  proposed?: Partial<CalEvent>
  user?: { id: number; username: string; email: string; status: string; created_at: string } | null
  profile?: Profile | null
}

type Tab = 'event_new' | 'event_change' | 'member_signup' | 'history'
const TABS: { id: Tab; label: string; icon: string; perm: string }[] = [
  { id: 'event_new', label: 'New events', icon: 'calendar', perm: 'approvals.events' },
  { id: 'event_change', label: 'Event changes', icon: 'edit', perm: 'approvals.changes' },
  { id: 'member_signup', label: 'Member sign-ups', icon: 'users', perm: 'approvals.signups' },
  { id: 'history', label: 'History', icon: 'clock', perm: 'page.approvals' },
]

/** Admin › Review and approval: TOs' new events and edits, and members waiting to join. */
export function ApprovalsPage() {
  const session = useSession()
  const tabs = TABS.filter((t) => session.can(t.perm))
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'history')
  const [data, setData] = useState<{ pending: Approval[]; recent: Approval[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiGet<{ pending: Approval[]; recent: Approval[] }>('approvals.list')
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  const count = (t: Tab) => (data && t !== 'history' ? data.pending.filter((a) => a.kind === t).length : 0)
  const list = !data ? [] : tab === 'history' ? data.recent : data.pending.filter((a) => a.kind === tab)

  return (
    <div className="brand-page rv-page">
      <PageHead page="approvals" title="Review and approval">
        Events Tournament Organisers added or changed, and members who signed up. Nothing goes live until it’s approved here.
      </PageHead>
      <div className="brand-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="brand-tab" onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={16} /> {t.label}
            {count(t.id) > 0 && <span className="rv-count">{count(t.id)}</span>}
          </button>
        ))}
      </div>
      {error && <p className="acct-error">{error}</p>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && !list.length && <p className="muted">{tab === 'history' ? 'Nothing has been reviewed yet.' : 'Nothing is waiting.'}</p>}
      <div className="rv-list">
        {list.map((a) => (
          <ApprovalCard
            key={a.id}
            a={a}
            onDecided={(next) => {
              setData(next)
              session.refresh()
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ApprovalCard({ a, onDecided }: { a: Approval; onDecided: (d: { pending: Approval[]; recent: Approval[] }) => void }) {
  const { toast } = useDialogs()
  const { navigate } = useBrand()
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)

  const decide = async (approve: boolean, note = '') => {
    setBusy(true)
    try {
      onDecided(await apiPost('approvals.decide', { id: a.id, approve, note }))
      toast(approve ? 'Approved' : 'Rejected')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    } finally {
      setBusy(false)
      setRejecting(false)
    }
  }

  const title =
    a.kind === 'member_signup'
      ? [a.profile?.firstName, a.profile?.lastName].filter(Boolean).join(' ') || a.user?.username || 'Deleted user'
      : (a.kind === 'event_change' ? a.proposed?.name : a.event?.name) || a.event?.name || 'Deleted event'

  return (
    <section className="rv-card">
      <div className="rv-card-head">
        <div>
          <span className="rv-kind">{a.kind === 'member_signup' ? 'Member sign-up' : a.kind === 'event_new' ? 'New event' : 'Event change'}</span>
          <h3>{title}</h3>
          <p className="muted small">
            {a.kind === 'member_signup' ? 'Signed up' : `Sent by ${a.submittedBy ?? '—'}`} · {when(a.submittedAt)}
            {a.status !== 'pending' && (
              <>
                {' '}
                · <strong className={`rv-status rv-status--${a.status}`}>{a.status === 'approved' ? 'Approved' : 'Rejected'}</strong> by {a.reviewedBy ?? '—'}, {when(a.reviewedAt)}
                {a.note && <> – “{a.note}”</>}
              </>
            )}
          </p>
        </div>
        {a.status === 'pending' && (
          <div className="rv-actions">
            {a.event && (
              <button className="ui-btn ui-btn--small" onClick={() => navigate({ page: 'events', eventId: a.event!.id })}>
                Open event
              </button>
            )}
            <button className="ui-btn ui-btn--small ui-btn--danger" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </button>
            <button className="ui-btn ui-btn--small ui-btn--primary" disabled={busy} onClick={() => decide(true)}>
              <Icon name="check" size={13} /> Approve
            </button>
          </div>
        )}
      </div>
      {a.kind === 'member_signup' && a.user && (
        <dl className="rv-facts">
          <Fact label="Username" value={a.user.username} />
          <Fact label="Email" value={a.user.email} />
        </dl>
      )}
      {a.kind === 'event_new' && a.event && (
        <dl className="rv-facts">
          <Fact label="When" value={`${dateRangeLabel(a.event)} · ${timeLabel(a.event)}`} />
          <Fact label="Where" value={a.event.location || '—'} />
        </dl>
      )}
      {a.kind === 'event_change' && a.event && a.proposed && <ChangeTable live={a.event} proposed={a.proposed} />}
      {rejecting && <RejectDialog onCancel={() => setRejecting(false)} onReject={(note) => decide(false, note)} />}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="pf-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

const FIELDS: { key: keyof CalEvent; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'startDate', label: 'Start date' },
  { key: 'endDate', label: 'End date' },
  { key: 'allDay', label: 'All day' },
  { key: 'startTime', label: 'Start time' },
  { key: 'endTime', label: 'End time' },
  { key: 'location', label: 'Location' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'memberOnly', label: 'Members only' },
  { key: 'citizensOnly', label: 'AU & NZ citizens only' },
]

/** Plain text of a value: formatted text without its tags, lists one item per line. */
function text(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string') return v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' && x ? Object.values(x).filter((y) => typeof y === 'string' && y && !/^[\w]+-[\w]+$/.test(y)).join(' · ') : String(x))).join('\n')
  if (typeof v === 'object') return Object.values(v).filter((y) => typeof y === 'string' && y).join(' · ')
  return String(v)
}

/** What the change would do: current → proposed, for each field that differs. */
function ChangeTable({ live, proposed }: { live: CalEvent; proposed: Partial<CalEvent> }) {
  const rows: { label: string; from: string; to: string }[] = []
  for (const f of FIELDS) {
    const a = text(live[f.key])
    const b = text(proposed[f.key])
    if (JSON.stringify(live[f.key] ?? null) !== JSON.stringify(proposed[f.key] ?? null) && a !== b) rows.push({ label: f.label, from: a, to: b })
  }
  const ld = (live.details ?? {}) as unknown as Record<string, unknown>
  const pd = (proposed.details ?? {}) as unknown as Record<string, unknown>
  for (const key of new Set([...Object.keys(ld), ...Object.keys(pd)])) {
    if (JSON.stringify(ld[key] ?? null) === JSON.stringify(pd[key] ?? null)) continue
    const label = SECTIONS.find((s) => s.id === key)?.label ?? key
    rows.push({ label, from: text(ld[key]), to: text(pd[key]) })
  }
  if (!rows.length) return <p className="muted small">No visible differences.</p>
  return (
    <div className="ie-table-wrap rv-diff">
      <table className="ie-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Now</th>
            <th>Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="um-old">{r.from || <span className="muted">—</span>}</td>
              <td className="um-new">{r.to || <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RejectDialog({ onCancel, onReject }: { onCancel: () => void; onReject: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <Modal title="Reject this request?" onClose={onCancel} width={460}>
      <div className="modal-body form">
        <label className="form-row">
          Note for the record (optional)
          <textarea className="ui-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </label>
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="ui-btn ui-btn--danger" onClick={() => onReject(note.trim())}>
          Reject
        </button>
      </div>
    </Modal>
  )
}
