// Rounds and byes of a tournament.
import { parseISO } from 'date-fns'
import { detailsOf } from '../data/eventDetails'
import type { CalEvent, EventBye } from '../types'

/** Scheduled rounds in date order: round number = position. */
export function scheduledRounds(e: CalEvent): { round: number; start: Date | null; label: string }[] {
  return [...detailsOf(e).schedule]
    .filter((r) => r.date)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((r, i) => ({ round: i + 1, start: r.date ? parseISO(`${r.date}T${r.time || '00:00'}`) : null, label: r.round || `Round ${i + 1}` }))
}

export const roundCount = (e: CalEvent) => Math.max(scheduledRounds(e).length, ...(e.pairings ?? []).map((r) => r.round), 0)

/** A round is released once its pairings are on the tournament. */
export const isReleased = (e: CalEvent, n: number) => !!e.pairings?.some((r) => r.round === n)

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
