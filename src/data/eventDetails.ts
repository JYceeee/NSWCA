import { addYears, isAfter, isBefore, parseISO } from 'date-fns'
import type { CalEvent, DivisionFees, DivisionTimeControl, EventCategory, EventDetailsData, Profile, TimeType } from '../types'
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
/** The FIDE rating that fits the tournament (or the division): its first ticked time control, standard when none is ticked. */
export const fideRatingFor = (d: EventDetailsData, division?: string) => FIDE_RATINGS.find((r) => timeControlOf(d, division).timeTypes.includes(r.type)) ?? FIDE_RATINGS[0]

/** Tournament detail sections, in page order. */
export const SECTIONS: SectionDef[] = [
  { id: 'divisions', label: 'Divisions', kind: 'divisions', required: false, hint: 'Leave empty if the tournament has one section' },
  { id: 'schedule', label: 'Dates & schedule', kind: 'schedule', required: true },
  { id: 'timeControl', label: 'Time control', kind: 'text', required: true, hint: 'Tick at least one, then describe it, e.g. 60 min + 30 sec increment per move' },
  { id: 'fees', label: 'Entry fees', kind: 'fees', required: true },
  { id: 'entriesClose', label: 'Entries close', kind: 'datetime', required: true },
  { id: 'venue', label: 'Venue', kind: 'venue', required: true },
  { id: 'contact', label: 'Contact details', kind: 'contact', required: true },
  { id: 'eventDetails', label: 'Event details', kind: 'text', required: true },
  { id: 'regulations', label: 'Event regulations', kind: 'text', required: true },
  { id: 'byeRules', label: 'Bye rules', kind: 'text', required: true },
  { id: 'forfeitRules', label: 'Forfeit rules', kind: 'text', required: true },
  { id: 'playerRules', label: 'Rules for players', kind: 'text', required: false },
  { id: 'spectatorRules', label: 'Rules for spectators', kind: 'text', required: false },
  { id: 'prizes', label: 'Prizes', kind: 'text', required: true },
  { id: 'terms', label: 'Terms and conditions', kind: 'text', required: true },
  { id: 'registrationUrl', label: 'Registration link', kind: 'url', required: false, hint: 'If players register on another website. Leave empty to take entries here.' },
  { id: 'resultsUrl', label: 'External results link', kind: 'url', required: false, hint: 'If the results are on another website. A division can have its own link in Divisions.' },
]

/** Sections shown side by side on the tournament page (the first of each pair on the left). */
export const SIDE_BY_SIDE: [keyof EventDetailsData, keyof EventDetailsData][] = [
  ['venue', 'contact'],
  ['byeRules', 'forfeitRules'],
  ['playerRules', 'spectatorRules'],
]

export const emptyDetails = (): EventDetailsData => ({
  schedule: [], venue: { name: '', room: '', address: '', mapUrl: '', note: '' }, contact: { name: '', email: '', phone: '' }, eventDetails: '', fees: [], feesNote: '',
  regulations: '', timeControl: '', timeTypes: [], divisions: [], byeRules: '', forfeitRules: '', playerRules: '', spectatorRules: '',
  prizes: '', terms: '', entriesClose: '', registrationUrl: '', resultsUrl: '',
  halfPointByes: false,
})

export const detailsOf = (e: CalEvent): EventDetailsData => ({ ...emptyDetails(), ...e.details })

export function isTournament(e: CalEvent, categories: EventCategory[]) {
  return /tournament/i.test(categories.find((c) => c.id === e.category)?.name ?? '')
}

export type ScheduleRow = EventDetailsData['schedule'][number]

const namedDivisions = (d: EventDetailsData) => d.divisions.filter((x) => x.name.trim())

/** Each division has its own rounds: the box is unticked and there are divisions to differ. */
export const perDivisionRounds = (d: EventDetailsData) => d.sameRounds === false && namedDivisions(d).length > 1

/** A division's rounds: its own when rounds differ by division, otherwise the shared ones. */
export const scheduleOf = (d: EventDetailsData, division: string): ScheduleRow[] => (perDivisionRounds(d) ? d.divisionSchedules?.[division] ?? [] : d.schedule)

/** Each division has its own time control: the box is unticked and there are divisions to differ. */
export const perDivisionTimeControl = (d: EventDetailsData) => d.sameTimeControl === false && namedDivisions(d).length > 1

/** A division's time control: its own when they differ by division (and a division is named), otherwise the shared one. */
export const timeControlOf = (d: EventDetailsData, division?: string): DivisionTimeControl =>
  perDivisionTimeControl(d) && division !== undefined
    ? d.divisionTimeControls?.[division] ?? { timeControl: '', timeTypes: [] }
    : { timeControl: d.timeControl, timeTypes: d.timeTypes ?? [] }

/** Each division has its own entry fees: the box is unticked and there are divisions to differ. */
export const perDivisionFees = (d: EventDetailsData) => d.sameFees === false && namedDivisions(d).length > 1

/** A division's fees: its own when they differ by division (and a division is named), otherwise the shared ones. */
export const feesOf = (d: EventDetailsData, division?: string): DivisionFees =>
  perDivisionFees(d) && division !== undefined ? d.divisionFees?.[division] ?? { fees: [], feesNote: '' } : { fees: d.fees, feesNote: d.feesNote ?? '' }

/** Every list of rounds the tournament has: one per division, or the shared one. */
export const allSchedules = (d: EventDetailsData): ScheduleRow[][] => (perDivisionRounds(d) ? namedDivisions(d).map((x) => scheduleOf(d, x.id)) : [d.schedule])

/** Is a section filled in enough? */
export function sectionFilled(d: EventDetailsData, s: SectionDef): boolean {
  switch (s.kind) {
    case 'schedule':
      return allSchedules(d).every((rows) => rows.some((r) => r.date))
    case 'venue':
      return !!(d.venue.name.trim() && d.venue.address.trim())
    case 'contact':
      return !!(d.contact.name.trim() && (d.contact.email.trim() || d.contact.phone.trim()))
    case 'fees':
      return (perDivisionFees(d) ? namedDivisions(d).map((x) => feesOf(d, x.id)) : [feesOf(d)]).every((x) => x.fees.some((f) => f.type.trim() && f.amount.trim()))
    case 'divisions':
      return d.divisions.some((x) => x.name.trim())
    case 'text':
      if (s.id === 'timeControl')
        return (perDivisionTimeControl(d) ? namedDivisions(d).map((x) => timeControlOf(d, x.id)) : [timeControlOf(d)]).every(
          (tc) => tc.timeTypes.length > 0 && !!toPlain(tc.timeControl).trim(),
        )
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
