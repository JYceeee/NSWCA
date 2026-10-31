import { format, parseISO } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { apiGet, apiPost } from '../lib/api'
import { PageHead } from '../site/PageHead'
import { useSession } from '../store/BrandStore'
import { LogDialog } from './UsersPage'

interface Version {
  version: number
  subject: string
  body: string
  /** UTC; null = the site's default wording, never edited. */
  at: string | null
  by: string
}

interface Template extends Version {
  id: string
  name: string
  description: string
  to: string
  vars: { key: string; label: string; sample: string }[]
  /** Placeholders the text can't lose. */
  required: string[]
  /** An empty text means the email isn't sent. */
  optional: boolean
  /** Earlier versions, newest first. */
  history: Version[]
}

type Answer = { templates: Template[] }

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g

const when = (at: string | null) => (at ? format(parseISO(at.replace(' ', 'T') + 'Z'), 'd MMM yyyy, h:mm a') : 'Original')

/** The email with sample details in its placeholders. */
function fill(text: string, t: Template) {
  return text.replace(PLACEHOLDER, (all, key) => t.vars.find((v) => v.key === key)?.sample ?? all)
}

/** What the template can't be saved with; the server checks the same. */
function problem(t: Template, subject: string, body: string): string | null {
  if (!subject.trim()) return 'Enter a subject.'
  if (!body.trim() && !t.optional) return 'Enter the email’s text.'
  const unknown = [...`${subject} ${body}`.matchAll(PLACEHOLDER)].find((m) => !t.vars.some((v) => v.key === m[1]))
  if (unknown) return `{{${unknown[1]}}} isn’t a placeholder this email can use.`
  const used = [...body.matchAll(PLACEHOLDER)].map((m) => m[1])
  const missing = body.trim() ? t.required.find((k) => !used.includes(k)) : undefined
  return missing ? `This email needs {{${missing}}} in its text.` : null
}

/** Every email the site sends: choose one on the left to read it on the right. */
export function EmailTemplatesPage() {
  const session = useSession()
  const [list, setList] = useState<Template[] | null>(null)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'edit' | 'history' | null>(null)
  const [log, setLog] = useState(false)

  useEffect(() => {
    apiGet<Answer>('emails.list')
      .then((r) => setList(r.templates))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the email templates'))
  }, [])

  const current = list?.find((t) => t.id === picked) ?? list?.[0]
  const open = (t: Template, d: 'edit' | 'history') => {
    setPicked(t.id)
    setDialog(d)
  }

  return (
    <div className="brand-page">
      <PageHead page="emails" title="Email templates" className="ap-head" actions={
        session.can('emails.log') && (
          <button className="ui-btn" onClick={() => setLog(true)}>
            <Icon name="listBullet" size={15} /> Log
          </button>
        )
      }>
        The emails the site sends. Choose one to preview it with sample details.
      </PageHead>
      {error && <p className="acct-error" role="alert">{error}</p>}
      {current && list && (
        <div className="et-layout">
          <ul className="et-list">
            {list.map((t) => (
              <li key={t.id} className={t.id === current.id ? 'et-row et-row--on' : 'et-row'}>
                <button className="et-pick" aria-current={t.id === current.id || undefined} onClick={() => setPicked(t.id)}>
                  <strong>{t.name}</strong>
                  <span className="muted small">To: {t.to} · Version {t.version}</span>
                </button>
                {session.can('emails.edit') && (
                  <button className="ui-btn ui-btn--small" onClick={() => open(t, 'edit')}>
                    <Icon name="edit" size={14} /> Edit
                  </button>
                )}
                <button className="ui-btn ui-btn--small" onClick={() => open(t, 'history')}>
                  <Icon name="clock" size={14} /> History
                </button>
              </li>
            ))}
          </ul>
          <section className="et-preview-side" aria-label="Preview">
            <p className="muted small et-when">{current.description}</p>
            <EmailPreview t={current} subject={current.subject} body={current.body} />
          </section>
        </div>
      )}
      {current && dialog === 'edit' && <EditDialog key={current.version} t={current} onSaved={setList} onClose={() => setDialog(null)} />}
      {current && dialog === 'history' && <HistoryDialog key={current.version} t={current} canRestore={session.can('emails.edit')} onSaved={setList} onClose={() => setDialog(null)} />}
      {log && <LogDialog api="emails.log" title="Email template log" onClose={() => setLog(false)} />}
    </div>
  )
}

function EmailPreview({ t, subject, body }: { t: Template; subject: string; body: string }) {
  return (
    <div className="et-mail">
      <div className="et-mail-head">
        <span className="muted small">Subject</span>
        <strong>{fill(subject, t)}</strong>
        <span className="muted small">To</span>
        <span>{t.to}</span>
      </div>
      {body.trim() ? <p className="et-mail-body">{fill(body, t)}</p> : <p className="et-mail-body muted">This email is switched off: with no text, it isn’t sent.</p>}
    </div>
  )
}

function EditDialog({ t, onSaved, onClose }: { t: Template; onSaved: (l: Template[]) => void; onClose: () => void }) {
  const { confirm, toast } = useDialogs()
  const [subject, setSubject] = useState(t.subject)
  const [body, setBody] = useState(t.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const dirty = subject !== t.subject || body !== t.body

  const close = async () => {
    if (!dirty || (await confirm({ title: 'Discard your changes?', message: 'The template stays as it was.', confirmLabel: 'Discard', danger: true }))) onClose()
  }
  const insert = (key: string) => {
    const el = area.current
    const text = `{{${key}}}`
    if (!el) return
    const at = el.selectionStart
    setBody(body.slice(0, at) + text + body.slice(el.selectionEnd))
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = at + text.length
    })
  }
  const save = async () => {
    const bad = problem(t, subject, body)
    if (bad) return setError(bad)
    setBusy(true)
    setError('')
    try {
      const r = await apiPost<Answer>('emails.save', { id: t.id, subject, body, base: t.version })
      onSaved(r.templates)
      toast(`Saved as version ${t.version + 1}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the template')
      setBusy(false)
    }
  }

  return (
    <Modal title={`Edit · ${t.name}`} onClose={close} width={1000}>
      <div className="modal-body et-edit">
        <div className="et-edit-form">
          <label className="pc-field">
            <span>Subject</span>
            <input className="ui-input" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="pc-field">
            <span>Text</span>
            <textarea ref={area} className="ui-input" rows={14} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="pc-field">
            <span>Placeholders</span>
            <div className="et-vars">
              {t.vars.map((v) => (
                <button key={v.key} type="button" className="et-var" title={`${v.label}, e.g. ${v.sample}`} onClick={() => insert(v.key)}>
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
            <small className="muted">Click one to add it to the text. It’s replaced with the real details when the email is sent. Emails are plain text.</small>
          </div>
          {error && <p className="acct-error" role="alert">{error}</p>}
        </div>
        <EmailPreview t={t} subject={subject} body={body} />
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={close}>Cancel</button>
        <button className="ui-btn ui-btn--primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save new version'}
        </button>
      </div>
    </Modal>
  )
}

function HistoryDialog({ t, canRestore, onSaved, onClose }: { t: Template; canRestore: boolean; onSaved: (l: Template[]) => void; onClose: () => void }) {
  const { confirm, toast } = useDialogs()
  const versions: Version[] = [t, ...t.history]
  const [shown, setShown] = useState(t.version)
  const [busy, setBusy] = useState(false)
  const v = versions.find((x) => x.version === shown) ?? t

  const restore = async () => {
    const ok = await confirm({
      title: `Go back to version ${v.version}?`,
      message: `Its wording becomes the current email, saved as version ${t.version + 1}. Version ${t.version} stays in the history.`,
      confirmLabel: 'Restore',
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await apiPost<Answer>('emails.restore', { id: t.id, version: v.version, base: t.version })
      onSaved(r.templates)
      toast(`Version ${v.version} restored as version ${t.version + 1}`)
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not restore that version')
      setBusy(false)
    }
  }

  return (
    <Modal title={`History · ${t.name}`} onClose={onClose} width={1000}>
      <div className="modal-body et-history">
        <ul className="et-versions">
          {versions.map((x) => (
            <li key={x.version}>
              <button className={x.version === v.version ? 'et-version et-version--on' : 'et-version'} onClick={() => setShown(x.version)}>
                <strong>Version {x.version}</strong>
                {x.version === t.version && <span className="badge-applied">Current</span>}
                <span className="muted small">{when(x.at)} · {x.by}</span>
              </button>
            </li>
          ))}
        </ul>
        <EmailPreview t={t} subject={v.subject} body={v.body} />
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Close</button>
        {canRestore && v.version !== t.version && (
          <button className="ui-btn ui-btn--primary" disabled={busy} onClick={restore}>
            <Icon name="undo" size={15} /> Restore version {v.version}
          </button>
        )}
      </div>
    </Modal>
  )
}
