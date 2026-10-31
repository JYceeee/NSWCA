import { addDays, eachDayOfInterval, format, isAfter, isBefore, max as maxDate, min as minDate, parse, startOfMonth } from 'date-fns'
import type { CalEvent, CalViewSettings, ColorRef, EventBook, EventCategory, EventDetailsData } from '../types'
import type { TokenKey } from './tokens'

export const DATE = 'yyyy-MM-dd'
/** Monday first. */
export const WEEK = { weekStartsOn: 1 } as const

export const toDate = (d: string) => parse(d, DATE, new Date())
export const fmtDate = (d: Date) => format(d, DATE)

/** "14:00" -> "2:00 PM" */
export const fmtTime = (t: string) => format(parse(t, 'HH:mm', new Date()), 'h:mm a')

export function timeLabel(e: CalEvent) {
  return e.allDay ? 'All day' : `${fmtTime(e.startTime)} – ${fmtTime(e.endTime)}`
}

/** Mon first, as the calendar. Values are date-fns getDay numbers (0 = Sunday). */
export const WEEKDAYS = [
  { day: 1, short: 'Mon' }, { day: 2, short: 'Tue' }, { day: 3, short: 'Wed' }, { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' }, { day: 6, short: 'Sat' }, { day: 0, short: 'Sun' },
]

export const isRecurring = (e: CalEvent) => !!e.weekdays?.length

/** "Mon, Wed" in calendar order. */
export const weekdayList = (days: number[]) => WEEKDAYS.filter((w) => days.includes(w.day)).map((w) => w.short).join(', ')

export function dateRangeLabel(e: CalEvent) {
  const a = toDate(e.startDate)
  if (isRecurring(e)) return `Every ${weekdayList(e.weekdays!)} · ${format(a, 'd MMM')} – ${format(toDate(e.endDate), 'd MMM yyyy')}`
  if (e.endDate === e.startDate) return format(a, 'EEEE d MMMM yyyy')
  return `${format(a, 'EEE d MMM')} – ${format(toDate(e.endDate), 'EEE d MMM yyyy')}`
}

/** Does the event happen on this day? Recurring events only on their weekdays. */
export function occursOn(e: CalEvent, day: Date) {
  const d = fmtDate(day)
  if (e.startDate > d || e.endDate < d) return false
  return !isRecurring(e) || e.weekdays!.includes(day.getDay())
}

/** Events on a day (multi-day events count on every day), all-day first then by start time. */
export function eventsOn(events: CalEvent[], day: Date) {
  const d = fmtDate(day)
  return events
    .filter((e) => e.startDate <= d && e.endDate >= d && (!isRecurring(e) || e.weekdays!.includes(day.getDay())))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name))
}

/** Does the event happen at least once between from and to (recurring: on one of its weekdays)? */
export function inRange(e: CalEvent, from: Date, to: Date) {
  if (isAfter(toDate(e.startDate), to) || isBefore(toDate(e.endDate), from)) return false
  if (!isRecurring(e)) return true
  const start = maxDate([toDate(e.startDate), from])
  const end = minDate([toDate(e.endDate), to])
  return eachDayOfInterval({ start, end }).some((d) => e.weekdays!.includes(d.getDay()))
}

const t = (token: TokenKey, alpha = 100): ColorRef => ({ token, alpha })

export const builtinCategories = (): EventCategory[] => [
  { id: 'cat-tournament', name: 'Tournament', color: t('primary') },
  { id: 'cat-training', name: 'Training', color: t('secondary') },
  { id: 'cat-social', name: 'Social', color: t('success') },
  { id: 'cat-meeting', name: 'Meeting', color: t('warning') },
]

export function blankEvent(id: string, date: string, category: string): CalEvent {
  return { id, name: '', startDate: date, endDate: date, allDay: false, startTime: '10:00', endTime: '11:00', location: '', description: '', category }
}

/** Sample events spread over the current month so the calendar isn't empty. */
function sampleEvents(): CalEvent[] {
  const m = startOfMonth(new Date())
  const day = (n: number) => fmtDate(addDays(m, n))
  const ev = (id: number, name: string, start: number, end: number, time: [string, string] | null, location: string, category: string, description = ''): CalEvent => ({
    id: `ev-sample-${id}`, name, startDate: day(start), endDate: day(end), allDay: !time, startTime: time?.[0] ?? '09:00', endTime: time?.[1] ?? '17:00',
    location, description, category,
  })
  return [
    ev(1, 'Committee meeting', 1, 1, ['18:30', '20:00'], 'Club room', 'cat-meeting', 'Monthly committee meeting. Agenda sent a week before.'),
    ev(2, 'Junior training', 3, 3, ['16:00', '17:30'], 'Hall B', 'cat-training'),
    { ...ev(3, 'Open rapid tournament', 5, 6, null, 'Town Hall', 'cat-tournament', 'Two-day rapid event, 7 rounds. Entries close the Wednesday before.'), memberOnly: true, details: sampleTournament(day) },
    ev(4, 'Club night', 8, 8, ['19:00', '22:00'], 'Club room', 'cat-social'),
    ev(5, 'Junior training', 10, 10, ['16:00', '17:30'], 'Hall B', 'cat-training'),
    ev(6, 'Coaching session', 10, 10, ['18:00', '19:30'], 'Club room', 'cat-training'),
    ev(7, 'Simul with a grandmaster', 10, 10, ['19:30', '21:30'], 'Main hall', 'cat-social', 'Play one of 20 boards. Bookings required.'),
    ev(8, 'Junior training', 17, 17, ['16:00', '17:30'], 'Hall B', 'cat-training'),
    ev(9, 'Interclub league', 19, 19, ['13:00', '18:00'], 'Away – North Club', 'cat-tournament'),
    ev(10, 'Members’ dinner', 22, 22, ['18:30', '21:00'], 'The Grand Hotel', 'cat-social'),
    ev(11, 'Junior training', 24, 24, ['16:00', '17:30'], 'Hall B', 'cat-training'),
  ]
}

/** Complete details for the sample tournament, so its full page can be seen. */
function sampleTournament(day: (n: number) => string): EventDetailsData {
  return {
    schedule: [
      { id: 'rd1', round: 'Round 1', date: day(5), time: '10:00' },
      { id: 'rd2', round: 'Round 2', date: day(5), time: '11:30' },
      { id: 'rd3', round: 'Round 3', date: day(5), time: '14:00' },
      { id: 'rd4', round: 'Round 4', date: day(5), time: '15:30' },
      { id: 'rd5', round: 'Round 5', date: day(6), time: '10:00' },
      { id: 'rd6', round: 'Round 6', date: day(6), time: '11:30' },
      { id: 'rd7', round: 'Round 7', date: day(6), time: '14:00' },
    ],
    venue: { name: 'Town Hall', address: '483 George St, Sydney NSW 2000', mapUrl: '' },
    contact: { name: 'Alex Chen (Tournament director)', email: 'events@example.com', phone: '0400 000 000' },
    eventDetails: 'A two-day, seven-round rapid open.\n\n- FIDE rapid rated\n- ACF rapid rated\n- Free coffee for players',
    fees: [
      { id: 'f1', type: 'Adult', amount: '60', note: '' },
      { id: 'f2', type: 'Junior (under 18)', amount: '40', note: '' },
      { id: 'f3', type: 'Member', amount: '45', note: 'Current club members' },
    ],
    regulations: 'FIDE Laws of Chess apply, with the Rapidplay appendix.',
    timeControl: '15 minutes + 10 seconds increment per move',
    timeTypes: ['rapid'],
    divisions: [
      { id: 'd1', name: 'Open', ratingRange: '' },
      { id: 'd2', name: 'Under 1600', ratingRange: 'Rated under 1600 or unrated' },
    ],
    byeRules: '- Up to two half-point byes in rounds 1–5\n- Request byes before the start of round 1',
    forfeitRules: 'Players more than 15 minutes late forfeit the game. Two forfeits and you are withdrawn.',
    playerRules: '- Mobile phones switched off in the playing hall\n- Record your result at the arbiter’s table',
    spectatorRules: '',
    prizes: '- 1st: $500\n- 2nd: $250\n- 3rd: $125\n- Best Under 1600: $100',
    terms: 'Entry fees are non-refundable after entries close. Photos may be taken for the club website.',
    entriesClose: `${day(3)}T21:00`,
    registrationUrl: '',
    halfPointByes: true,
  }
}

export const defaultCalView = (): CalViewSettings => ({
  cellHeight: { month: 184, fortnight: 240, week: 420 },
  byDay: false,
  startHour: 7,
  endHour: 23,
  hourHeight: 48,
})

export const calView = (b: EventBook): CalViewSettings => ({ ...defaultCalView(), ...b.view })

/** "13" -> "1 PM", 0 / 24 -> "12 AM" */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? 'AM' : 'PM'}`

export const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

export function builtinEvents(): EventBook[] {
  return [{ id: 'events-default', name: 'Events', builtin: true, events: sampleEvents(), categories: builtinCategories(), view: defaultCalView() }]
}
