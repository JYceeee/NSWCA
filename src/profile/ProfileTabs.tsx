import { format } from 'date-fns'
import { Icon } from '../components/Icon'
import { detailsOf, isDraft, isTournament } from '../data/eventDetails'
import { dateRangeLabel, fmtDate, toDate } from '../data/events'
import { standingOf } from '../events/pairings'
import { fmtPoints } from '../events/results'
import { useEventBook } from '../events/useEventBook'
import { useBrand } from '../store/BrandStore'
import type { CalEvent, EventEntry, Profile } from '../types'

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

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

export function MyResults({ p }: { p: Profile }) {
  const { navigate } = useBrand()
  const mine = useMyTournaments(p)
  if (!p.email.trim()) return <NeedEmail />
  const today = fmtDate(new Date())
  // Finished tournaments, plus any that already have results.
  const rows = mine.filter((m) => m.event.endDate < today || m.event.pairings?.length).sort((a, b) => b.event.startDate.localeCompare(a.event.startDate))
  if (!rows.length) return <p className="muted pf-tab-empty">No results yet – they appear here after the tournaments you entered have finished.</p>

  return (
    <div className="pf-results">
      <table className="ed-table">
        <thead>
          <tr>
            <th>Tournament</th>
            <th>Date</th>
            <th>Place</th>
            <th>Points</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ event, entry }) => {
            const r = standingOf(event.pairings ?? [], entry.name)
            return (
              <tr key={event.id}>
                <td>
                  <a href={`#events/${event.id}`} onClick={(e) => (e.preventDefault(), navigate({ page: 'events', eventId: event.id, eventEdit: false }))}>
                    {event.name}
                  </a>
                </td>
                <td>{format(toDate(event.startDate), 'd MMM yyyy')}</td>
                {r ? (
                  <>
                    <td>
                      <strong>
                        {r.tied ? '=' : ''}
                        {ordinal(r.place)}
                      </strong>{' '}
                      <span className="muted">of {r.of}</span>
                    </td>
                    <td>{fmtPoints(r.points)}</td>
                    <td>Round {r.after}</td>
                  </>
                ) : (
                  <td colSpan={3} className="muted">
                    {event.pairings?.length ? 'You’re not in the uploaded rounds yet' : 'Results not available yet'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
