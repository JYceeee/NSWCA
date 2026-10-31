import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { ROLE_LABEL } from '../data/permissions'
import { apiPost } from '../lib/api'
import { useBrand, useSession } from '../store/BrandStore'

/** A password reset / welcome link (#reset/<token>), read before the app replaces the address. */
const RESET_TOKEN = window.location.hash.match(/^#reset\/([a-f0-9]{20,})$/)?.[1] ?? null

type Dialog = 'login' | 'register' | 'forgot' | 'reset' | 'password' | null

/** Top of every page: sign in / the signed-in user, and whether the server can be reached. */
export function AccountBar({ inTopBar }: { inTopBar: boolean }) {
  const session = useSession()
  const { toast } = useDialogs()
  const { navigate } = useBrand()
  const [dialog, setDialog] = useState<Dialog>(RESET_TOKEN ? 'reset' : null)
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user, status, notice } = session
  // With the top bar on, the buttons sit in it (see #tb-account in TopBar).
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(inTopBar ? document.getElementById('tb-account') : null), [inTopBar])

  const logout = async () => {
    setMenu(false)
    await session.logout()
    navigate({ page: 'home' })
    toast('Signed out')
  }

  // Messages from saving to the server (sent for approval, refused…).
  useEffect(() => {
    if (notice) toast(notice.text)
  }, [notice, toast])

  useEffect(() => {
    if (!menu) return
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [menu])

  if (status === 'local') return null

  const pill = (primary: boolean) => (slot ? `st-btn st-btn--small st-btn--${primary ? 'primary' : 'soft'}` : `ui-btn ui-btn--small${primary ? ' ui-btn--primary' : ''}`)
  const controls = user ? (
    <>
      <div className="acct-menu" ref={ref}>
        <button className={slot ? pill(false) : 'ui-btn ui-btn--small acct-user'} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          {slot ? (
            'My Account'
          ) : (
            <>
              <Icon name="user" size={14} /> {user.name} <span className="acct-role">{ROLE_LABEL[user.role]}</span>
              <Icon name="chevronDown" size={13} />
            </>
          )}
        </button>
        {menu && (
          <div className="acct-pop" role="menu">
            <div className="acct-pop-head">
              <strong>{user.username}</strong>
              <span className="muted small">{user.email}</span>
            </div>
            {session.can('page.profile') && (
              <button role="menuitem" onClick={() => (setMenu(false), navigate({ page: 'profile' }))}>
                <Icon name="user" size={14} /> Profile
              </button>
            )}
            <button role="menuitem" onClick={() => (setMenu(false), setDialog('password'))}>
              <Icon name="settings" size={14} /> Change password
            </button>
            {!slot && (
              <button role="menuitem" onClick={logout}>
                <Icon name="x" size={14} /> Sign out
              </button>
            )}
          </div>
        )}
      </div>
      {slot && (
        <button className={pill(true)} onClick={logout}>
          Log out
        </button>
      )}
    </>
  ) : (
    status === 'online' && (
      <>
        {slot ? (
          <>
            <button className={pill(false)} onClick={() => setDialog('login')}>My Account</button>
            <button className={pill(true)} onClick={() => setDialog('register')}>{session.setup ? 'Set up the site' : 'Register'}</button>
          </>
        ) : (
          <>
            <button className={pill(false)} onClick={() => setDialog('register')}>{session.setup ? 'Set up the site' : 'Sign up'}</button>
            <button className={pill(true)} onClick={() => setDialog('login')}>Sign in</button>
          </>
        )}
      </>
    )
  )
  const busy = status === 'offline' || status === 'loading' || session.syncing

  return (
    <div className={slot && !busy ? 'acct-bar acct-bar--empty' : 'acct-bar'}>
      {status === 'offline' && (
        <span className="acct-offline" role="status">
          <Icon name="info" size={14} /> Can’t reach the server – showing the last saved copy, read-only.
          <button className="toast-action acct-retry" onClick={() => session.refresh()}>
            Retry
          </button>
        </span>
      )}
      {status === 'loading' && <span className="muted small">Loading…</span>}
      {session.syncing && <span className="muted small">Saving…</span>}
      <span className="acct-spacer" />
      {slot ? createPortal(controls, slot) : controls}
      {dialog === 'login' && <LoginDialog onClose={() => setDialog(null)} onGo={setDialog} />}
      {dialog === 'register' && <RegisterDialog onClose={() => setDialog(null)} />}
      {dialog === 'forgot' && <ForgotDialog onClose={() => setDialog(null)} />}
      {dialog === 'reset' && RESET_TOKEN && <ResetDialog token={RESET_TOKEN} onClose={() => setDialog(null)} onDone={() => setDialog('login')} />}
      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

/** Shown instead of a page this role can't open. */
export function NoAccess({ page }: { page: string }) {
  const session = useSession()
  return (
    <div className="brand-page">
      <header className="page-head">
        <h1>{page}</h1>
        <p>{session.user ? 'Your role doesn’t have access to this page.' : session.readOnly ? 'This page needs the server, which can’t be reached right now.' : 'Sign in to see this page.'}</p>
      </header>
    </div>
  )
}

function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-row">
      {label}
      {children}
    </label>
  )
}

function FormError({ error }: { error: string }) {
  return error ? (
    <p className="acct-error" role="alert">
      {error}
    </p>
  ) : null
}

function LoginDialog({ onClose, onGo }: { onClose: () => void; onGo: (d: Dialog) => void }) {
  const session = useSession()
  const { toast } = useDialogs()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useSubmit()
  return (
    <Modal title="Sign in" onClose={onClose} width={420}>
      <form
        onSubmit={run(async () => {
          await session.login(login.trim(), password)
          toast('Signed in')
          onClose()
        })}
      >
        <div className="modal-body form">
          <Field label="Username or email">
            <input className="ui-input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />
          </Field>
          <Field label="Password">
            <input className="ui-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <FormError error={error} />
          <div className="acct-links">
            <button type="button" className="link-btn" onClick={() => onGo('forgot')}>
              Forgot password?
            </button>
            <button type="button" className="link-btn" onClick={() => onGo('register')}>
              New here? Sign up
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="ui-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ui-btn ui-btn--primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RegisterDialog({ onClose }: { onClose: () => void }) {
  const session = useSession()
  const { toast } = useDialogs()
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', confirm: '' })
  const [done, setDone] = useState(false)
  const { busy, error, run } = useSubmit()
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  if (done)
    return (
      <Modal title="Thanks for signing up" onClose={onClose} width={440}>
        <div className="modal-body">An admin will review your sign-up. You can sign in once it’s approved – you’ll get an email.</div>
        <div className="modal-actions">
          <button className="ui-btn ui-btn--primary" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
      </Modal>
    )
  return (
    <Modal title={session.setup ? 'Set up the site' : 'Sign up'} onClose={onClose} width={480}>
      <form
        onSubmit={run(async () => {
          if (f.password !== f.confirm) throw new Error('The passwords don’t match.')
          const r = await apiPost<{ admin?: boolean; pending?: boolean }>('register', f)
          if (r.admin) {
            await session.refresh()
            toast('Welcome – you’re the site’s Admin')
            onClose()
          } else setDone(true)
        })}
      >
        <div className="modal-body form">
          {session.setup && <p className="muted small">No one has an account yet. This first account becomes the site’s Admin.</p>}
          <div className="acct-two">
            <Field label="First name">
              <input className="ui-input" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} required autoFocus />
            </Field>
            <Field label="Last name">
              <input className="ui-input" autoComplete="family-name" value={f.lastName} onChange={set('lastName')} required />
            </Field>
          </div>
          <Field label="Username">
            <input className="ui-input" autoComplete="username" value={f.username} onChange={set('username')} required pattern="[A-Za-z0-9._\-]{3,64}" title="3–64 letters, numbers, dots, dashes or underscores" />
          </Field>
          <Field label="Email">
            <input className="ui-input" type="email" autoComplete="email" value={f.email} onChange={set('email')} required />
          </Field>
          <div className="acct-two">
            <Field label="Password">
              <input className="ui-input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required />
            </Field>
            <Field label="Confirm password">
              <input className="ui-input" type="password" autoComplete="new-password" minLength={8} value={f.confirm} onChange={set('confirm')} required />
            </Field>
          </div>
          {!session.setup && <p className="muted small">An admin approves new members before they can sign in.</p>}
          <FormError error={error} />
        </div>
        <div className="modal-actions">
          <button type="button" className="ui-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ui-btn ui-btn--primary" disabled={busy}>
            {busy ? 'Sending…' : session.setup ? 'Create admin account' : 'Sign up'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ForgotDialog({ onClose }: { onClose: () => void }) {
  const [login, setLogin] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, run } = useSubmit()
  return (
    <Modal title="Forgot password" onClose={onClose} width={420}>
      {sent ? (
        <>
          <div className="modal-body">If an account matches, we’ve emailed it a link to set a new password. The link works once, for 48 hours.</div>
          <div className="modal-actions">
            <button className="ui-btn ui-btn--primary" onClick={onClose} autoFocus>
              Done
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={run(async () => {
            await apiPost('forgot', { login: login.trim() })
            setSent(true)
          })}
        >
          <div className="modal-body form">
            <Field label="Username or email">
              <input className="ui-input" value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />
            </Field>
            <FormError error={error} />
          </div>
          <div className="modal-actions">
            <button type="button" className="ui-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="ui-btn ui-btn--primary" disabled={busy}>
              Email me a link
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function ResetDialog({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useDialogs()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const { busy, error, run } = useSubmit()
  return (
    <Modal title="Set a new password" onClose={onClose} width={420}>
      <form
        onSubmit={run(async () => {
          if (pw !== confirm) throw new Error('The passwords don’t match.')
          await apiPost('reset', { token, password: pw })
          toast('Password set – sign in with it now')
          onDone()
        })}
      >
        <div className="modal-body form">
          <Field label="New password">
            <input className="ui-input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required />
          </Field>
          <Field label="Confirm password">
            <input className="ui-input" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <FormError error={error} />
        </div>
        <div className="modal-actions">
          <button type="button" className="ui-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ui-btn ui-btn--primary" disabled={busy}>
            Set password
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useDialogs()
  const [f, setF] = useState({ current: '', password: '', confirm: '' })
  const { busy, error, run } = useSubmit()
  return (
    <Modal title="Change password" onClose={onClose} width={420}>
      <form
        onSubmit={run(async () => {
          if (f.password !== f.confirm) throw new Error('The new passwords don’t match.')
          await apiPost('password', { current: f.current, password: f.password })
          toast('Password changed')
          onClose()
        })}
      >
        <div className="modal-body form">
          <Field label="Current password">
            <input className="ui-input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoFocus required />
          </Field>
          <Field label="New password">
            <input className="ui-input" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
          </Field>
          <Field label="Confirm new password">
            <input className="ui-input" type="password" autoComplete="new-password" minLength={8} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
          </Field>
          <FormError error={error} />
        </div>
        <div className="modal-actions">
          <button type="button" className="ui-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="ui-btn ui-btn--primary" disabled={busy}>
            Change password
          </button>
        </div>
      </form>
    </Modal>
  )
}
