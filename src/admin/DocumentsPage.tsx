import { useRef, useState, type FormEvent } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { downloadPlayersTemplate, PLAYER_COLUMNS } from '../events/players'
import { COLUMNS as EVENT_COLUMNS, downloadTemplate as downloadEventsTemplate } from '../events/spreadsheet'
import { ROLE_LABEL, type MatrixRole } from '../data/permissions'
import { apiPost, apiUpload, fileUrl } from '../lib/api'
import { PageHead } from '../site/PageHead'
import { useSession } from '../store/BrandStore'
import type { DocItem } from '../store/sync'

interface Doc {
  id: string
  name: string
  file: string
  description: string
  usedIn: string
  columns: readonly string[]
  download: () => Promise<void>
}

const DOCS: Doc[] = [
  {
    id: 'players',
    name: 'Players template',
    file: 'players-template.xlsx',
    description: 'A list of players to import into a tournament.',
    usedIn: 'Tournament page › View entries › Import',
    columns: PLAYER_COLUMNS,
    download: downloadPlayersTemplate,
  },
  {
    id: 'events',
    name: 'Events template',
    file: 'events-template.xlsx',
    description: 'Events to bulk-import into the calendar.',
    usedIn: 'Upcoming events › Import / Export › Import events',
    columns: EVENT_COLUMNS,
    download: downloadEventsTemplate,
  },
]

/** Admin › Document: documents the admin added (each visible to chosen roles), and templates to download. */
export function DocumentsPage() {
  const { toast, confirm } = useDialogs()
  const session = useSession()
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const canDownload = session.can('documents.download')
  const remove = async (d: DocItem) => {
    if (!(await confirm({ title: `Delete “${d.title}”?`, message: 'The file is removed from the server for everyone.', confirmLabel: 'Delete', danger: true }))) return
    try {
      const r = await apiPost<{ documents: DocItem[] }>('documents.delete', { id: d.id })
      session.setDocuments(r.documents)
      toast('Document deleted')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That didn’t work')
    }
  }
  const get = async (d: Doc) => {
    setBusy(d.id)
    try {
      await d.download()
    } catch {
      toast(`Could not create ${d.file}`)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="brand-page doc-page">
      <PageHead page="documents" title="Document" className="ap-head" actions={<>
        {session.can('documents.add') && (
          <button className="ui-btn ui-btn--primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Add document
          </button>
        )}
      </>}>
        Documents and templates to download.
      </PageHead>
      {session.documents.length > 0 && (
        <>
          <h2 className="doc-heading">Documents</h2>
          <div className="doc-list">
            {session.documents.map((d) => (
              <section key={d.id} className="doc-item">
                <span className="doc-icon">
                  <Icon name="listBullet" size={22} />
                </span>
                <div className="doc-main">
                  <strong>{d.title}</strong>
                  {d.description && <span>{d.description}</span>}
                  <span className="muted small">
                    {d.fileName} · {fileSize(d.size)}
                    {session.can('documents.add') && <> · Visible to {['Admin', ...d.visibleTo.map((r) => ROLE_LABEL[r as MatrixRole] ?? r)].join(', ')}</>}
                  </span>
                </div>
                {canDownload && (
                  <a className="ui-btn" href={fileUrl(d.uploadId)} download={d.fileName}>
                    <Icon name="download" size={15} /> Download
                  </a>
                )}
                {session.can('documents.delete') && (
                  <button className="icon-btn" aria-label={`Delete ${d.title}`} title="Delete" onClick={() => remove(d)}>
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </section>
            ))}
          </div>
          <h2 className="doc-heading">Templates</h2>
        </>
      )}
      <div className="doc-list">
        {DOCS.map((d) => (
          <section key={d.id} className="doc-item">
            <span className="doc-icon">
              <Icon name="grid" size={22} />
            </span>
            <div className="doc-main">
              <strong>{d.name}</strong>
              <span>{d.description}</span>
              <span className="muted small">
                Columns: {d.columns.join(', ')} · Used in {d.usedIn}
              </span>
            </div>
            {canDownload && (
              <button className="ui-btn" disabled={busy === d.id} onClick={() => get(d)}>
                <Icon name="download" size={15} /> {busy === d.id ? 'Preparing…' : 'Download'}
              </button>
            )}
          </section>
        ))}
      </div>
      {adding && <AddDocumentDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const VISIBLE_ROLES: MatrixRole[] = ['organiser', 'arbiter', 'member', 'visitor']

/** Upload any file (PDF, Word, Excel…) with a title, a description and the roles that can see it. */
function AddDocumentDialog({ onClose }: { onClose: () => void }) {
  const session = useSession()
  const { toast } = useDialogs()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [roles, setRoles] = useState<MatrixRole[]>(['organiser', 'arbiter'])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return setError('Choose a file to upload.')
    setBusy(true)
    setError('')
    try {
      const r = await apiUpload<{ documents: DocItem[] }>('documents.add', { title: title.trim(), description: description.trim(), visibleTo: JSON.stringify(roles), file })
      session.setDocuments(r.documents)
      toast('Document added')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Add document" onClose={onClose} width={520}>
      <form onSubmit={submit}>
        <div className="modal-body form">
          <label className="form-row">
            Title
            <input className="ui-input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </label>
          <label className="form-row">
            Description
            <textarea className="ui-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="form-row">
            File
            <div className="doc-file">
              <button type="button" className="ui-btn" onClick={() => input.current?.click()}>
                <Icon name="upload" size={15} /> Choose file
              </button>
              <span className="muted small">{file ? `${file.name} · ${fileSize(file.size)}` : 'PDF, Word, Excel or any other file, up to 60 MB'}</span>
              <input ref={input} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <fieldset className="doc-roles">
            <legend>Who can see and download it</legend>
            <label>
              <input type="checkbox" checked disabled /> Admin
            </label>
            {VISIBLE_ROLES.map((r) => (
              <label key={r}>
                <input type="checkbox" checked={roles.includes(r)} onChange={(e) => setRoles(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} /> {ROLE_LABEL[r]}
              </label>
            ))}
            <span className="muted small">A role also needs the Document page ticked in Roles and permissions.</span>
          </fieldset>
          {error && <p className="acct-error">{error}</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="ui-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ui-btn ui-btn--primary" disabled={busy}>
            {busy ? 'Uploading…' : 'Add document'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
