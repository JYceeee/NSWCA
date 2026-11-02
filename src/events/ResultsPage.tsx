import { Fragment, useMemo } from 'react'
import { Icon } from '../components/Icon'
import { isTournament } from '../data/eventDetails'
import { dateRangeLabel } from '../data/events'
import { PageHead } from '../site/PageHead'
import { hashFor, useBrand } from '../store/BrandStore'
import type { CalEvent } from '../types'
import { Player } from './PairingsSection'
import { releasedRounds, resultLinks, standings, standingsLabel, type ResultLink } from './standings'
import { useEventBook } from './useEventBook'

const LATEST = 13

/** The Results tab: recent tournaments, or one tournament's standings. */
export function ResultsPage() {
  const { ui } = useBrand()
  return ui.eventId ? <TournamentResults key={ui.eventId} id={ui.eventId} division={ui.eventDivision} /> : <ResultsList />
}

function ResultsList() {
  const { book } = useEventBook()
  const events = useMemo(
    () =>
      book.events
        .filter((e) => isTournament(e, book.categories) && (e.status ?? 'approved') === 'approved' && resultLinks(e).length > 0)
        .sort((a, b) => b.endDate.localeCompare(a.endDate))
        .slice(0, LATEST),
    [book],
  )

  return (
    <div className="brand-page rs-page">
      <PageHead page="results" title="Results">
        Results of our recent tournaments.
      </PageHead>
      {events.length ? (
        <div className="rs-wrap">
          <table className="rs-table tbl-bordered">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Results Link</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const links = resultLinks(e)
                return links.length === 1 && !links[0].name ? (
                  <tr key={e.id}>
                    <td>{e.name}</td>
                    <td><ResultsLink event={e} link={links[0]} /></td>
                  </tr>
                ) : (
                  <Fragment key={e.id}>
                    <tr className="tbl-group">
                      <th colSpan={2} scope="colgroup">{e.name}</th>
                    </tr>
                    {links.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td><ResultsLink event={e} link={l} /></td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No results yet.</p>
      )}
    </div>
  )
}

function ResultsLink({ event, link }: { event: CalEvent; link: ResultLink }) {
  const { ui, navigate } = useBrand()
  if (!link.released)
    return (
      <a href={link.url} target="_blank" rel="noreferrer">
        Results <Icon name="link" size={13} />
      </a>
    )
  const target = { page: 'results', eventId: event.id, eventDivision: link.id } as const
  return (
    <a href={`#${hashFor({ ...ui, ...target })}`} onClick={(e) => (e.preventDefault(), navigate(target))}>
      Results
    </a>
  )
}

function TournamentResults({ id, division }: { id: string; division: string }) {
  const { book } = useEventBook()
  const { navigate } = useBrand()
  const event = book.events.find((e) => e.id === id)
  const back = () => navigate({ page: 'results' })
  const links = event ? resultLinks(event) : []
  const link = links.find((x) => x.id === division) ?? links.find((x) => x.released) ?? links[0]

  return (
    <div className="brand-page rs-page">
      <button className="ui-btn ui-btn--small ed-back" onClick={back}>
        <Icon name="chevronLeft" size={14} /> All results
      </button>
      {!event || !link ? (
        <p className="muted">No results for this tournament yet.</p>
      ) : (
        <>
          <header className="rs-head">
            <h1>{event.name}</h1>
            <p className="muted">
              {dateRangeLabel(event)} ·{' '}
              <a href={`#events/${event.id}`} onClick={(e) => (e.preventDefault(), navigate({ page: 'events', eventId: event.id }))}>
                Tournament page
              </a>
            </p>
          </header>
          {links.length > 1 && (
            <div className="pr-rounds pr-divisions" role="tablist" aria-label="Division">
              {links.map((x) => (
                <button key={x.id} role="tab" aria-selected={x.id === link.id} className={x.id === link.id ? 'pr-round pr-round--on' : 'pr-round'} onClick={() => navigate({ page: 'results', eventId: event.id, eventDivision: x.id })}>
                  {x.name}
                </button>
              ))}
            </div>
          )}
          {releasedRounds(event, link.id).length ? (
            <Standings event={event} division={link.id} />
          ) : (
            <p>
              These results are on another website:{' '}
              <a href={link.url} target="_blank" rel="noreferrer">
                View results <Icon name="link" size={13} />
              </a>
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Standings({ event, division }: { event: CalEvent; division: string }) {
  return (
    <>
      <p className="muted small">{standingsLabel(event, division)}</p>
      <div className="pr-wrap">
        <table className="pr-table tbl-striped rs-standings">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Player</th>
              <th>Rtg</th>
              <th>Fed</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings(event, division).map((r) => (
              <tr key={r.pos}>
                <td>{r.pos}</td>
                <td><Player s={r.side} color="white" you={false} /></td>
                <td>{r.rating || '–'}</td>
                <td>
                  <span className="rs-fed">
                    {r.flag && <img src={`https://flagcdn.com/w40/${r.flag}.png`} alt="" loading="lazy" />}
                    {r.fed}
                  </span>
                </td>
                <td className="pr-result">{r.pts.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
