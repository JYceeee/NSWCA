import { addYears, isAfter, isBefore, parseISO } from 'date-fns'
import type { CalEvent, EventCategory, EventDetailsData, Profile, TimeType } from '../types'
import { toPlain } from '../lib/richtext'
import { toDate } from './events'

export type SectionKind = 'schedule' | 'venue' | 'contact' | 'text' | 'fees' | 'divisions' | 'datetime' | 'url'

export interface SectionDef {
  id: keyof EventDetailsData
  label: string
  kind: SectionKind
  required: boolean
  hint?: string
}

export const TIME_TYPES: { id: TimeType; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'rapid', label: 'Rapid' },
  { id: 'blitz', label: 'Blitz' },
]

export type FideKey = 'fideStandard' | 'fideRapid' | 'fideBlitz'
export const FIDE_RATINGS: { key: FideKey; label: string; type: TimeType }[] = [
  { key: 'fideStandard', label: 'FIDE Standard', type: 'standard' },
  { key: 'fideRapid', label: 'FIDE Rapid', type: 'rapid' },
  { key: 'fideBlitz', label: 'FIDE Blitz', type: 'blitz' },
]
/** The FIDE rating that fits the tournament: its (first ticked) time control, standard when none is ticked. */
export const fideRatingFor = (d: EventDetailsData) => FIDE_RATINGS.find((r) => d.timeTypes?.includes(r.type)) ?? FIDE_RATINGS[0]

/** Tournament detail sections, in page order. */
export const SECTIONS: SectionDef[] = [
  { id: 'schedule', label: 'Dates & schedule', kind: 'schedule', required: true },
  { id: 'venue', label: 'Venue', kind: 'venue', required: true },
  { id: 'contact', label: 'Contact details', kind: 'contact', required: true },
  { id: 'eventDetails', label: 'Event details', kind: 'text', required: true },
  { id: 'fees', label: 'Entry fees', kind: 'fees', required: true },
  { id: 'regulations', label: 'Event regulations', kind: 'text', required: true },
  { id: 'timeControl', label: 'Time control', kind: 'text', required: true, hint: 'Tick at least one, then describe it, e.g. 60 min + 30 sec increment per move' },
  { id: 'divisions', label: 'Divisions', kind: 'divisions', required: false, hint: 'Leave empty if the tournament has one section' },
  { id: 'byeRules', label: 'Bye rules', kind: 'text', required: true },
  { id: 'forfeitRules', label: 'Forfeit rules', kind: 'text', required: true },
  { id: 'playerRules', label: 'Rules for players', kind: 'text', required: false },
  { id: 'spectatorRules', label: 'Rules for spectators', kind: 'text', required: false },
  { id: 'prizes', label: 'Prizes', kind: 'text', required: true },
  { id: 'terms', label: 'Terms and conditions', kind: 'text', required: true },
  { id: 'entriesClose', label: 'Entries close', kind: 'datetime', required: true },
  { id: 'registrationUrl', label: 'Registration link', kind: 'url', required: false, hint: 'If players register on another website. Leave empty to take entries here.' },
]

export const emptyDetails = (): EventDetailsData => ({
  schedule: [], venue: { name: '', room: '', address: '', mapUrl: '', note: '' }, contact: { name: '', email: '', phone: '' }, eventDetails: '', fees: [], feesNote: '',
  regulations: '', timeControl: '', timeTypes: [], divisions: [], byeRules: '', forfeitRules: '', playerRules: '', spectatorRules: '',
  prizes: '', terms: '', entriesClose: '', registrationUrl: '',
  halfPointByes: false,
})

export const detailsOf = (e: CalEvent): EventDetailsData => ({ ...emptyDetails(), ...e.details })

export function isTournament(e: CalEvent, categories: EventCategory[]) {
  return /tournament/i.test(categories.find((c) => c.id === e.category)?.name ?? '')
}

/** Is a section filled in enough? */
export function sectionFilled(d: EventDetailsData, s: SectionDef): boolean {
  switch (s.kind) {
    case 'schedule':
      return d.schedule.some((r) => r.date)
    case 'venue':
      return !!(d.venue.name.trim() && d.venue.address.trim())
    case 'contact':
      return !!(d.contact.name.trim() && (d.contact.email.trim() || d.contact.phone.trim()))
    case 'fees':
      return d.fees.some((f) => f.type.trim() && f.amount.trim())
    case 'divisions':
      return d.divisions.some((x) => x.name.trim())
    case 'text':
      if (s.id === 'timeControl' && !d.timeTypes?.length) return false
      return !!toPlain(String(d[s.id] ?? '')).trim()
    default:
      return !!String(d[s.id] ?? '').trim()
  }
}

/** Required tournament sections still empty (none for other events). */
export function missingSections(e: CalEvent, categories: EventCategory[]): SectionDef[] {
  if (!isTournament(e, categories)) return []
  const d = detailsOf(e)
  return SECTIONS.filter((s) => s.required && !sectionFilled(d, s))
}

export const isDraft = (e: CalEvent, categories: EventCategory[]) => missingSections(e, categories).length > 0

/** When entries close: the set deadline, otherwise the start of the event. */
export function entriesCloseAt(e: CalEvent): Date {
  const d = detailsOf(e).entriesClose
  return d ? parseISO(d) : toDate(e.startDate)
}

/** Membership is valid on a date when the latest join / renewal is within the 12 months before it. */
export function memberOn(p: Profile, date: Date): boolean {
  const last = [p.joinDate, p.renewDate].filter(Boolean).sort().pop()
  if (!last) return false
  const from = toDate(last)
  return !isAfter(from, date) && isBefore(date, addYears(from, 1))
}

export const isAuNzCitizen = (p: Profile) => p.citizenship === 'AU' || p.citizenship === 'NZ'

export const mapsUrl = (d: EventDetailsData) =>
  d.venue.mapUrl.trim() || (d.venue.address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.venue.name} ${d.venue.address}`.trim())}` : '')
