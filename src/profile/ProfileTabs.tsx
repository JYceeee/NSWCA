import { format } from 'date-fns'
import { Icon } from '../components/Icon'
import { detailsOf, isDraft, isTournament } from '../data/eventDetails'
import { dateRangeLabel, fmtDate } from '../data/events'
import { useEventBook } from '../events/useEventBook'
import { useBrand } from '../store/BrandStore'
import type { CalEvent, EventEntry, Profile } from '../types'

/** Tournaments the user entered here (matched by their profile email). */
function useMyTournaments(p: Profile): { event: CalEvent; entry: EventEntry }[] {
  const { book } = useEventBook()
  const email = p.email.trim().toLowerCase()
  if (!email) return []
  return book.events.flatMap((event) => {
    if (!isTournament(event, book.categories)) return []
    const entry = event.entries?.find((e) => e.email.toLowerCase() === email)
    return entry ? [{ event, entry }] : []
  })
}

function NeedEmail() {
  return <p className="muted pf-tab-empty">Add your email address in Personal info – your entries are linked to it.</p>
}

export function MyTournaments({ p }: { p: Profile }) {
  const { navigate } = useBrand()
  const { book } = useEventBook()
  const mine = useMyTournaments(p)
  if (!p.email.trim()) return <NeedEmail />
  const today = fmtDate(new Date())
  const upcoming = mine.filter((m) => m.event.endDate >= today).sort((a, b) => a.event.startDate.localeCompare(b.event.startDate))
  const past = mine.filter((m) => m.event.endDate < today).sort((a, b) => b.event.startDate.localeCompare(a.event.startDate))
  const open = (e: CalEvent) => navigate({ page: 'events', eventId: e.id, eventEdit: false })

  const list = (items: typeof mine) => (
    <div className="pf-list">
      {items.map(({ event, entry }) => {
        const d = detailsOf(event)
        const division = d.divisions.find((x) => x.id === entry.division)?.name
        return (
          <button key={event.id} className="pf-list-item" onClick={() => open(event)}>
            <span className="pf-list-main">
              <strong>{event.name}</strong>
              <span>
                {dateRangeLabel(event)}
                {(d.venue.name || event.location) && ` · ${d.venue.name || event.location}`}
                {division && ` · ${division}`}
              </span>
            </span>
            {isDraft(event, book.categories) && <span className="ev-badge ev-badge--draft">Draft</span>}
            <span className="muted small">Entered {format(new Date(entry.at), 'd MMM yyyy')}</span>
            <Icon name="chevron" size={16} />
          </button>
        )
      })}
    </div>
  )

  if (!mine.length) return <p className="muted pf-tab-empty">You haven’t entered any tournaments yet. Find one in Upcoming events and click Enter.</p>
  return (
    <>
      <section className="pf-tab-section">
        <h3>Upcoming ({upcoming.length})</h3>
        {upcoming.length ? list(upcoming) : <p className="muted">No upcoming tournaments.</p>}
      </section>
      <section className="pf-tab-section">
        <h3>Past ({past.length})</h3>
        {past.length ? list(past) : <p className="muted">No past tournaments yet.</p>}
      </section>
    </>
  )
}
