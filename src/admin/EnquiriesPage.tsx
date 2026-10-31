import { format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { apiGet, apiPost } from '../lib/api'
import { PageHead } from '../site/PageHead'
import { useSession } from '../store/BrandStore'

interface Enquiry {
  id: number
  firstName: string
  lastName: string
  email: string
  phone: string
  clubName: string
  inquiryType: string
  message: string
  handled: boolean
  createdAt: string
}

type Answer = { enquiries: Enquiry[] }

/** Messages from the Contact Us form, newest first. */
export function EnquiriesPage() {
  const session = useSession()
  const { confirm, toast } = useDialogs()
  const [list, setList] = useState<Enquiry[] | null>(null)
  const [error, setError] = useState('')
  const manage = session.can('enquiries.manage')

  useEffect(() => {
    apiGet<Answer>('enquiries.list')
      .then((r) => setList(r.enquiries))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the enquiries'))
  }, [])

  const act = async (action: string, body: object, done?: string) => {
    try {
      const r = await apiPost<Answer>(action, body)
      setList(r.enquiries)
      if (done) toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the change')
    }
  }

  const del = async (e: Enquiry) => {
    if (await confirm({ title: 'Delete this enquiry?', message: `The message from ${e.firstName} ${e.lastName} is removed for good.`, confirmLabel: 'Delete', danger: true }))
      act('enquiries.delete', { id: e.id }, 'Enquiry deleted')
  }

  return (
    <div className="brand-page">
      <PageHead page="enquiries" title="Enquiries">
        Messages sent from the Contact Us page.
      </PageHead>
      {error && <p className="acct-error" role="alert">{error}</p>}
      {list && !list.length && <p className="muted">No enquiries yet.</p>}
      <div className="enq-list">
        {list?.map((e) => (
          <section key={e.id} className={e.handled ? 'enq enq--handled' : 'enq'}>
            <div className="enq-head">
              <strong>{e.firstName} {e.lastName}</strong>
              <span className="badge-custom">{e.inquiryType}</span>
              {e.handled && <span className="badge-applied">Handled</span>}
              <span className="muted small enq-date">{format(parseISO(e.createdAt.replace(' ', 'T') + 'Z'), 'd MMM yyyy, h:mm a')}</span>
            </div>
            <div className="enq-contact muted small">
              {e.email && <a href={`mailto:${e.email}`}>{e.email}</a>}
              {e.phone && <a href={`tel:${e.phone}`}>{e.phone}</a>}
              {e.clubName && <span>{e.clubName}</span>}
            </div>
            <p className="enq-message">{e.message}</p>
            {manage && (
              <div className="enq-actions">
                <button className="ui-btn ui-btn--small" onClick={() => act('enquiries.handled', { id: e.id, handled: !e.handled })}>
                  <Icon name={e.handled ? 'undo' : 'check'} size={14} /> {e.handled ? 'Mark as new' : 'Mark handled'}
                </button>
                <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => del(e)}>
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
