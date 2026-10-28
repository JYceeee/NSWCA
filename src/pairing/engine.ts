// Byes, points and Gacrux (TRF) input / output for tournaments paired on this site.
import { format, parseISO } from 'date-fns'
import { fedForCountry } from '../data/countries'
import { detailsOf, fideRatingFor } from '../data/eventDetails'
import { toDate } from '../data/events'
import { boardScore, isFinished } from '../events/pairings'
import type { CalEvent, EventBye, EventEntry, PairingBoard, PairingRound, PairingSide } from '../types'

// ---------- Rounds ----------

/** Scheduled rounds in date order: round number = position. */
export function scheduledRounds(e: CalEvent): { round: number; start: Date | null; label: string }[] {
  return [...detailsOf(e).schedule]
    .filter((r) => r.date)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((r, i) => ({ round: i + 1, start: r.date ? parseISO(`${r.date}T${r.time || '00:00'}`) : null, label: r.round || `Round ${i + 1}` }))
}

export const roundCount = (e: CalEvent) => Math.max(scheduledRounds(e).length, ...(e.pairings ?? []).map((r) => r.round), 0)

export const roundOf = (e: CalEvent, n: number) => e.pairings?.find((r) => r.round === n)

/** A round is released once its pairings are on the tournament (uploaded or published). */
export const isReleased = (e: CalEvent, n: number) => !!roundOf(e, n)

// ---------- Byes ----------

/**
 * Value of every bye: ½ when the tournament allows half-point byes, the player hasn't used two yet,
 * and it was set by the organiser or requested before the previous round started (round 1: before it starts).
 * Anything else is a zero-point bye.
 */
export function byeValues(e: CalEvent, extra?: EventBye): Map<string, 0 | 0.5> {
  const d = detailsOf(e)
  const rounds = scheduledRounds(e)
  const all = [...(e.byes ?? []), ...(extra ? [extra] : [])].sort((a, b) => a.round - b.round || a.at.localeCompare(b.at))
  const used = new Map<string, number>()
  const out = new Map<string, 0 | 0.5>()
  for (const b of all) {
    const deadline = rounds.find((r) => r.round === Math.max(1, b.round - 1))?.start
    const inTime = b.by === 'organiser' || !deadline || new Date(b.at) < deadline
    const n = used.get(b.entryId) ?? 0
    const half = b.value !== 0 && !!d.halfPointByes && inTime && n < 2
    if (half) used.set(b.entryId, n + 1)
    out.set(b.id, half ? 0.5 : 0)
  }
  return out
}

/** Why a ½-point bye isn't possible for this player in this round (null = it is). */
export function halfByeBlock(e: CalEvent, entryId: string, round: number): string | null {
  if (!detailsOf(e).halfPointByes) return 'Half-point byes are off in this tournament’s Bye rules'
  const values = byeValues(e)
  const others = (e.byes ?? []).filter((b) => b.entryId === entryId && b.round !== round && values.get(b.id) === 0.5).length
  return others >= 2 ? 'Already has two half-point byes' : null
}

export const byeFor = (e: CalEvent, entryId: string, round: number) => e.byes?.find((b) => b.entryId === entryId && b.round === round)

/** Value the odd player's (pairing-allocated) bye is worth. */
export const pabPoints = (e: CalEvent) => Number(detailsOf(e).pabValue || '1')

// ---------- Points ----------

const sideOf = (b: PairingBoard, entryId: string): 'w' | 'b' | null => (b.white.entryId === entryId ? 'w' : b.black?.entryId === entryId ? 'b' : null)

/** Points a player scored in one round (0 when not in it). */
export function scoreIn(e: CalEvent, r: PairingRound, entryId: string): number {
  const board = r.boards.find((b) => sideOf(b, entryId))
  if (!board) return 0
  if (!board.black) return board.byeKind === 'half' ? 0.5 : board.byeKind === 'zero' ? 0 : board.byeKind === 'pab' ? pabPoints(e) : boardScore(board)[0]
  const [w, k] = boardScore(board)
  return sideOf(board, entryId) === 'w' ? w : k
}

export const pointsBefore = (e: CalEvent, entryId: string, round: number) =>
  (e.pairings ?? []).filter((r) => r.round < round).reduce((sum, r) => sum + scoreIn(e, r, entryId), 0)

// ---------- Start numbers ----------

/** Seeding rating: ACF, or the FIDE rating matching the tournament's time control. */
export const ratingOf = (e: CalEvent, x: EventEntry) => {
  const d = detailsOf(e)
  return Number((d.seedBy === 'acf' ? x.acfRating : x[fideRatingFor(d).key]) || 0)
}

/** Existing start numbers kept; new players added after them, by rating then name. */
export function startNumbers(e: CalEvent): Record<string, number> {
  const fixed = { ...(e.startNumbers ?? {}) }
  const next = Math.max(0, ...Object.values(fixed)) + 1
  const fresh = (e.entries ?? []).filter((x) => !fixed[x.id]).sort((a, b) => ratingOf(e, b) - ratingOf(e, a) || a.name.localeCompare(b.name))
  fresh.forEach((x, i) => (fixed[x.id] = next + i))
  return fixed
}

// ---------- Can this round be generated? ----------

export function generateBlock(e: CalEvent, n: number): string | null {
  const d = detailsOf(e)
  if (!(e.entries ?? []).length) return 'No one has entered this tournament yet'
  if (!d.pabValue || !d.topColour || !d.seedBy) return 'Fill in Pairing settings in the tournament’s Edit details first'
  for (let r = 1; r < n; r++) {
    const prev = roundOf(e, r)
    if (!prev) return `Round ${r} hasn’t been paired yet`
    if (!prev.generated) return `Round ${r} was uploaded from a file – generating needs every earlier round paired here`
    if (!isFinished(prev)) return `Round ${r} still needs results (Pairings › Results)`
  }
  return null
}

// ---------- TRF for Gacrux ----------

const pad = (s: string | number, n: number, left = false) => (left ? String(s).padEnd(n) : String(s).padStart(n)).slice(0, n)

/** TRF result letters for one player in a played round. */
function trfBlock(r: PairingRound, entryId: string, sno: Record<string, number>): string {
  const b = r.boards.find((x) => sideOf(x, entryId))
  if (!b) return '0000 - Z'
  if (!b.black) return `0000 - ${b.byeKind === 'pab' ? 'U' : b.byeKind === 'half' ? 'H' : b.byeKind === 'zero' ? 'Z' : 'U'}`
  const side = sideOf(b, entryId)!
  const opp = side === 'w' ? b.black.entryId : b.white.entryId
  const m = b.result.match(/^(1|0|½|\+|-)\s*-\s*(1|0|½|\+|-)/)
  const mine = m ? (side === 'w' ? m[1] : m[2]) : ' '
  const res = mine === '½' ? '=' : mine
  return `${pad(sno[opp!] ?? 0, 4)} ${side} ${res}`
}

/** TRF-16 file of the tournament up to (not including) round `n`, for Gacrux. */
export function buildTrf(e: CalEvent, n: number, sno: Record<string, number>, withRound?: PairingRound): string {
  const entries = [...(e.entries ?? [])].filter((x) => sno[x.id]).sort((a, b) => sno[a.id] - sno[b.id])
  const rounds = (e.pairings ?? []).filter((r) => r.round < n).sort((a, b) => a.round - b.round)
  if (withRound) rounds.push(withRound)
  const total = roundCount(e)
  const lines = [
    `012 ${e.name}`.slice(0, 90),
    `042 ${format(toDate(e.startDate), 'yyyy/MM/dd')}`,
    `052 ${format(toDate(e.endDate), 'yyyy/MM/dd')}`,
    `062 ${entries.length}`,
    '092 Individual: Swiss-System',
    `XXR ${total}`,
  ]
  const points = (id: string) => rounds.reduce((s, r) => s + scoreIn(e, r, id), 0)
  const ranked = [...entries].sort((a, b) => points(b.id) - points(a.id) || sno[a.id] - sno[b.id])
  for (const x of entries) {
    const chars = Array(92).fill(' ')
    const put = (col: number, text: string) => [...text].forEach((ch, i) => (chars[col - 1 + i] = ch))
    put(1, '001')
    put(5, pad(sno[x.id], 4))
    put(15, pad(x.name.replace(/[^\x20-\x7E -ɏ]/g, ''), 33, true))
    put(49, pad(ratingOf(e, x) || '', 4))
    put(54, pad(x.fed ?? '', 3, true))
    put(58, pad(x.fideId.replace(/\D/g, ''), 11))
    put(81, pad(points(x.id).toFixed(1), 4))
    put(86, pad(ranked.indexOf(x) + 1, 4))
    const blocks = rounds.map((r) => `  ${trfBlock(r, x.id, sno)}`).join('')
    lines.push(chars.join('').slice(0, 89) + blocks)
  }
  return lines.map((l) => l.trimEnd()).join('\n') + '\n'
}

// ---------- Gacrux pairs -> boards ----------

function side(e: CalEvent, x: EventEntry, sno: Record<string, number>, n: number): PairingSide {
  const pts = pointsBefore(e, x.id, n)
  return { entryId: x.id, sno: String(sno[x.id]), title: x.title ?? '', name: x.name, fed: x.fed ?? '', pts: String(pts) }
}

/** Boards from Gacrux's [white, black] start-number pairs (black 0 = pairing-allocated bye), then requested byes. */
export function boardsFromPairs(e: CalEvent, n: number, pairs: [number, number][], sno: Record<string, number>): PairingBoard[] {
  const bySno = new Map(Object.entries(sno).map(([id, s]) => [s, (e.entries ?? []).find((x) => x.id === id)!]))
  const pab = pabPoints(e)
  const boards: PairingBoard[] = []
  for (const [w, b] of pairs) {
    const white = bySno.get(w)
    if (!white) continue
    if (!b) boards.push({ board: 0, white: side(e, white, sno, n), black: null, result: pab === 1 ? '1' : pab === 0.5 ? '½' : '0', byeKind: 'pab' })
    else {
      const black = bySno.get(b)
      if (black) boards.push({ board: 0, white: side(e, white, sno, n), black: side(e, black, sno, n), result: '' })
    }
  }
  // Played boards first, then the odd player's bye, then requested byes.
  boards.sort((a, b) => Number(!a.black) - Number(!b.black))
  const values = byeValues(e)
  for (const bye of (e.byes ?? []).filter((x) => x.round === n)) {
    const x = (e.entries ?? []).find((y) => y.id === bye.entryId)
    if (!x) continue
    const half = values.get(bye.id) === 0.5
    boards.push({ board: 0, white: side(e, x, sno, n), black: null, result: half ? '½' : '0', byeKind: half ? 'half' : 'zero' })
  }
  return boards.map((b, i) => ({ ...b, board: i + 1 }))
}

/** Players with a bye in round n – left out of the pairing. */
export const unpairedIn = (e: CalEvent, n: number, sno: Record<string, number>) =>
  (e.byes ?? []).filter((b) => b.round === n && sno[b.entryId]).map((b) => sno[b.entryId])

/** Top seed's colour in round 1: White / Black / Random. */
export const topColour = (e: CalEvent): 'w' | 'b' => {
  const c = detailsOf(e).topColour
  return c === 'black' ? 'b' : c === 'white' ? 'w' : Math.random() < 0.5 ? 'w' : 'b'
}

/** Pairing-allocated bye value as a Gacrux score letter. */
export const pabLetter = (e: CalEvent) => ({ 1: 'W', 0.5: 'D', 0: 'Z' })[pabPoints(e) as 1 | 0.5 | 0] ?? 'W'

/** FIDE federation code for a profile citizenship (ISO 3166 alpha-2). */
export const fedCode = (citizenship: string) => (citizenship ? fedForCountry(citizenship) : '')
