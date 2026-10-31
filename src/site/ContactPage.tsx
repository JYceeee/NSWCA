import { useState, type FormEvent } from 'react'
import { sectionHeight } from '../data/pages'
import { apiPost, LOCAL_ONLY } from '../lib/api'
import { useBrand } from '../store/BrandStore'
import type { ContactConfig } from '../types'
import { SiteButton } from './PageHead'

export function ContactPage() {
  const { saved } = useBrand()
  return <ContactView contact={saved.pages[0].contact} />
}

const BLANK = { firstName: '', lastName: '', email: '', phone: '', clubName: '', inquiryType: '', message: '', website: '' }

export function ContactView({ contact, preview }: { contact: ContactConfig; preview?: boolean }) {
  const [f, setF] = useState(BLANK)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview) return
    if (!f.email.trim() && !f.phone.trim()) return setError('Enter an email address or a phone number, so we can reply.')
    if (LOCAL_ONLY) return setError('The form needs the server, which isn’t connected here.')
    setBusy(true)
    setError('')
    try {
      await apiPost('contact', f)
      setSent(true)
      setF(BLANK)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="hm ct">
      <section className="hm-section" style={{ minHeight: sectionHeight(contact.height) }}>
        <div className="hm-wrap ct-grid">
          <div>
            <h1>{contact.title}</h1>
            {contact.text && <p className="ct-lead">{contact.text}</p>}
            {contact.details && <p className="ct-details">{contact.details}</p>}
            {contact.links.length > 0 && (
              <div className="ct-links">
                {contact.links.map((b) => (
                  <SiteButton key={b.id} button={b} variant="soft" preview={preview} />
                ))}
              </div>
            )}
          </div>
          {sent ? (
            <div className="ct-thanks" role="status">
              <p>{contact.thanks}</p>
              <button className="st-btn st-btn--soft" onClick={() => setSent(false)}>
                Send another message
              </button>
            </div>
          ) : (
            <form className="ct-form" onSubmit={submit}>
              <label>
                <span>First name <em>*</em></span>
                <input className="ds-input" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} required />
              </label>
              <label>
                <span>Last name <em>*</em></span>
                <input className="ds-input" autoComplete="family-name" value={f.lastName} onChange={set('lastName')} required />
              </label>
              <label>
                <span>Email</span>
                <input className="ds-input" type="email" autoComplete="email" value={f.email} onChange={set('email')} />
              </label>
              <label>
                <span>Phone</span>
                <input className="ds-input" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
              </label>
              <p className="ct-hint">Please give at least one of email or phone.</p>
              <label className="ct-wide">
                <span>Club name (if any)</span>
                <input className="ds-input" value={f.clubName} onChange={set('clubName')} />
              </label>
              <label className="ct-wide">
                <span>Inquiry type <em>*</em></span>
                <select className="ds-input" value={f.inquiryType} onChange={set('inquiryType')} required>
                  <option value="">Select an inquiry type</option>
                  {contact.inquiryTypes.filter((t) => t.trim()).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ct-wide">
                <span>Message <em>*</em></span>
                <textarea className="ds-input" rows={6} value={f.message} onChange={set('message')} required />
              </label>
              {/* Hidden from people; bots fill it in. */}
              <input className="ct-trap" tabIndex={-1} autoComplete="off" aria-hidden value={f.website} onChange={set('website')} />
              {error && (
                <p className="ct-wide acct-error" role="alert">
                  {error}
                </p>
              )}
              <button className="st-btn st-btn--primary ct-wide" disabled={busy}>
                {busy ? 'Sending…' : 'Submit'}
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
