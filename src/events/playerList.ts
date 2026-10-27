// Admin › All players: the club's player list, and how tournament entries link to it.
import { format } from 'date-fns'
import type { EventBook, EventEntry, Player, Profile } from '../types'
import { uid } from '../store/BrandStore'
import { isSamePlayer } from './players'

/** "Surname, Firstname" → both parts; without a comma the last word is the surname. */
export function splitName(name: string): { lastName: string; firstName: string } {
  const n = name.trim().replace(/\s+/g, ' ')
  if (n.includes(',')) {
    const [last, ...rest] = n.split(',')
    return { lastName: last.trim(), firstName: rest.join(',').trim() }
  }
  const i = n.lastIndexOf(' ')
  return i < 0 ? { lastName: n, firstName: '' } : { lastName: n.slice(i + 1), firstName: n.slice(0, i) }
}

/** The name entries use: "Surname, Firstname". */
export const fullName = (p: Pick<Player, 'lastName' | 'firstName'>) => (p.firstName ? `${p.lastName}, ${p.firstName}` : p.lastName)

export const dmy = (d: string) => (d ? format(new Date(`${d}T00:00`), 'dd/MM/yyyy') : '')

export function playerFromEntry(x: EventEntry, id = uid('pl')): Player {
  return {
    id,
    ...splitName(x.name),
    dob: x.dob ?? '',
    gender: x.gender ?? '',
    fed: x.fed ?? '',
    title: x.title ?? '',
    fideId: x.fideId ?? '',
    kFide: x.kFide ?? '',
    fideStandard: x.fideStandard ?? '',
    fideRapid: x.fideRapid ?? '',
    fideBlitz: x.fideBlitz ?? '',
    acfId: x.acfId ?? '',
    acfRating: x.acfRating ?? '',
    email: x.email ?? '',
    added: x.at || new Date().toISOString(),
  }
}

/** The player's details as they go onto an entry (division, time and source are the entry's own). */
export const entryFields = (p: Player) => ({
  playerId: p.id,
  name: fullName(p),
  email: p.email,
  fed: p.fed,
  dob: p.dob,
  gender: p.gender,
  title: p.title,
  fideId: p.fideId,
  kFide: p.kFide,
  fideStandard: p.fideStandard,
  fideRapid: p.fideRapid,
  fideBlitz: p.fideBlitz,
  acfId: p.acfId,
  acfRating: p.acfRating,
})

const asWho = (p: Player) => ({ name: fullName(p), email: p.email, fideId: p.fideId, acfId: p.acfId, dob: p.dob })

/** The listed player an entry (or new details) is the same person as. */
export const findPlayer = (players: Player[], who: Parameters<typeof isSamePlayer>[0], except?: string) =>
  players.find((p) => p.id !== except && isSamePlayer(asWho(p), who))

/** Every search word must match the start of a surname or first name, or part of the DOB, FIDE ID or ACF ID. */
export function searchPlayers(players: Player[], query: string): Player[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const sorted = [...players].sort((a, b) => fullName(a).localeCompare(fullName(b)))
  if (!words.length) return sorted
  return sorted.filter((p) => {
    const names = `${p.lastName} ${p.firstName}`.toLowerCase().split(/[\s,'-]+/)
    const other = [p.dob, dmy(p.dob), p.fideId, p.acfId]
    return words.every((w) => {
      const word = w.replace(/,$/, '')
      return names.some((n) => n.startsWith(word)) || other.some((v) => v && v.includes(word))
    })
  })
}

/**
 * Member = the player has an account: they entered a tournament themselves, or they're the profile's player (same email).
 * Entry = added by an organiser (by hand, imported, or New player).
 */
export type PlayerStatus = 'member' | 'entry'
export const STATUS_LABEL: Record<PlayerStatus, string> = { member: 'Member', entry: 'Entry' }
export function playerStatus(p: Player, book: EventBook, profileEmail: string): PlayerStatus {
  const email = p.email.trim().toLowerCase()
  if (email && email === profileEmail.trim().toLowerCase()) return 'member'
  return book.events.some((e) => e.entries?.some((x) => x.playerId === p.id && x.source === 'signup')) ? 'member' : 'entry'
}

const SEX: Record<string, string> = { M: 'Male', F: 'Female' }
/** Player fields and the profile fields they show up as. */
const TO_PROFILE: [keyof Player, keyof Profile][] = [
  ['lastName', 'lastName'], ['firstName', 'firstName'], ['dob', 'dob'], ['gender', 'sex'], ['fed', 'federation'], ['title', 'title'], ['fideId', 'fideId'],
  ['kFide', 'kFide'], ['fideStandard', 'fideStandard'], ['fideRapid', 'fideRapid'], ['fideBlitz', 'fideBlitz'], ['acfId', 'acfId'], ['acfRating', 'acfRating'], ['email', 'email'],
]
/** Required on the profile, so an empty value in the player list leaves the profile's value. */
const KEEP_IF_CLEARED = new Set<keyof Profile>(['lastName', 'firstName', 'dob', 'sex', 'email'])

/** Is this the profile's player (same email, before or after the edit)? */
const isProfilePlayer = (profile: Profile, ...ps: (Player | undefined)[]) => {
  const mine = profile.email.trim().toLowerCase()
  return !!mine && ps.some((p) => p?.email.trim().toLowerCase() === mine)
}

/**
 * What a saved player changes on the profile: everything in the player list is copied over, for the player with an
 * account (same email as the profile). null = not this profile's player, or nothing to change.
 */
export function profileChanges(before: Player | undefined, after: Player, profile: Profile): Partial<Profile> | null {
  if (!isProfilePlayer(profile, before, after)) return null
  const patch: Record<string, string> = {}
  for (const [pk, fk] of TO_PROFILE) {
    const v = pk === 'gender' ? SEX[after.gender] ?? after.gender : after[pk]
    if (!v && KEEP_IF_CLEARED.has(fk)) continue
    if (v !== (profile[fk] ?? '')) patch[fk] = v
  }
  return Object.keys(patch).length ? (patch as Partial<Profile>) : null
}

/** Links every entry without a player to the matching listed player, or lists them as a new one. */
export function syncPlayers(book: EventBook): EventBook {
  const players = [...(book.players ?? [])]
  let changed = !book.players
  const events = book.events.map((e) => {
    if (!e.entries?.some((x) => !x.playerId)) return e
    changed = true
    return {
      ...e,
      entries: e.entries.map((x) => {
        if (x.playerId) return x
        let p = findPlayer(players, x)
        if (!p) players.push((p = playerFromEntry(x)))
        return { ...x, playerId: p.id }
      }),
    }
  })
  return changed ? { ...book, events, players } : book
}
