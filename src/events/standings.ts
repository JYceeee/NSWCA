// Standings and results links, worked out from a tournament's released rounds.
import { flagCode } from '../data/countries'
import { detailsOf, fideRatingFor } from '../data/eventDetails'
import type { CalEvent, EventEntry, PairingBoard, PairingRound, PairingSide } from '../types'
import { scheduledRounds } from './byes'
import { nameKey } from './results'

export interface Division {
  id: string
  name: string
}

/** The tournament's divisions (one with no name when it has none), then any that rounds still point to. */
export function divisionsOf(e: CalEvent): Division[] {
  const named = detailsOf(e).divisions.filter((d) => d.name.trim()).map((d) => ({ id: d.id, name: d.name }))
  const out = named.length ? named : [{ id: '', name: '' }]
  for (const r of e.pairings ?? []) {
    const id = r.division ?? ''
    if (!out.some((d) => d.id === id)) out.push({ id, name: id ? 'Removed division' : 'No division' })
  }
  return out
}

/** A division's rounds, in order. */
export const roundsOf = (e: CalEvent, division: string): PairingRound[] =>
  (e.pairings ?? []).filter((r) => (r.division ?? '') === division).sort((a, b) => a.round - b.round)

export const releasedRounds = (e: CalEvent, division: string) => roundsOf(e, division).filter((r) => r.resultsAt)

const VALUE: Record<string, number> = { '1': 1, '+': 1, '½': 0.5, '0': 0, '-': 0 }

/** Points for [white, black] from a result; null when it isn't one yet. Black's is 0 on a bye. */
export function boardPoints(b: PairingBoard, result: string): [number, number] | null {
  const s = result.trim()
  if (!b.black) {
    const v = VALUE[s.charAt(0)]
    return v === undefined ? null : [v, 0]
  }
  const m = s.match(/^(1|0|½|\+|-) - (1|0|½|\+|-)/)
  return m ? [VALUE[m[1]], VALUE[m[2]]] : null
}

export interface StandingRow {
  pos: number
  side: PairingSide
  /** '' = unrated. */
  rating: string
  fed: string
  flag: string
  pts: number
}

/** Released rounds only: most points, then highest rating (unrated last), then name. */
export function standings(e: CalEvent, division: string): StandingRow[] {
  const key = fideRatingFor(detailsOf(e), division).key
  const entries = e.entries ?? []
  const entryOf = (s: PairingSide): EventEntry | undefined => entries.find((x) => x.id === s.entryId) ?? entries.find((x) => nameKey(x.name) === nameKey(s.name))
  const rows = new Map<string, Omit<StandingRow, 'pos'>>()
  const add = (s: PairingSide, pts: number) => {
    const k = nameKey(s.name)
    const had = rows.get(k)
    if (had) {
      had.pts += pts
      return
    }
    const entry = entryOf(s)
    const fed = (s.fed || entry?.fed || '').toUpperCase()
    const shown = fed === 'AUS' || !fed ? entry?.state || fed : fed
    const rating = [s.rating, entry?.[key], entry?.acfRating].find((r) => Number(r) > 0) ?? ''
    rows.set(k, { side: { ...s, title: s.title || entry?.title || '' }, rating, fed: shown, flag: flagCode(shown), pts })
  }
  for (const r of releasedRounds(e, division))
    for (const b of r.boards) {
      const pts = boardPoints(b, b.releasedResult ?? '') ?? [0, 0]
      add(b.white, pts[0])
      if (b.black) add(b.black, pts[1])
    }
  return [...rows.values()]
    .sort((a, b) => b.pts - a.pts || Number(b.rating) - Number(a.rating) || a.side.name.localeCompare(b.side.name))
    .map((x, i) => ({ ...x, pos: i + 1 }))
}

/** "After round 4 of 7", or the rounds included when one was released out of order. */
export function standingsLabel(e: CalEvent, division: string) {
  const rounds = releasedRounds(e, division).map((r) => r.round)
  const total = Math.max(scheduledRounds(e, division).length, roundsOf(e, division).pop()?.round ?? 0)
  const last = rounds[rounds.length - 1]
  return last === rounds.length ? `After round ${last} of ${total}` : `Includes rounds ${rounds.join(', ')} of ${total}`
}

/** Only web links: these come from what organisers type and end up in an href. */
export const webUrl = (url?: string) => (/^https?:\/\//i.test(url?.trim() ?? '') ? url!.trim() : '')

export interface ResultLink extends Division {
  released: boolean
  /** External results, '' when there's none. */
  url: string
}

/** The divisions with something to show: released rounds here, or a link to results elsewhere. */
export function resultLinks(e: CalEvent): ResultLink[] {
  const d = detailsOf(e)
  return divisionsOf(e)
    .map((x) => ({
      ...x,
      released: releasedRounds(e, x.id).length > 0,
      url: webUrl(d.divisions.find((y) => y.id === x.id)?.resultsUrl) || webUrl(d.resultsUrl),
    }))
    .filter((x) => x.released || x.url)
}
