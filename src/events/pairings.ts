// Round pairings exported from Vega or Swiss-Manager: a TRF file with every round, or one round as .csv / .xlsx.
import type { EventEntry, PairingBoard, PairingSide } from '../types'
import { nameKey } from './results'
import { readGrid, str } from './spreadsheet'

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

export const TITLES = ['GM', 'IM', 'FM', 'CM', 'WGM', 'WIM', 'WFM', 'WCM', 'AGM', 'AIM', 'AFM', 'ACM']

/** "1/2-1/2", "0.5-0.5", "½:½", "1-0F" → "½ - ½", "1 - 0 F". */
export function fmtResult(v: string): string {
  const s = v.trim().replace(/1\/2|0[.,]5/g, '½').replace(/\s+/g, '')
  if (!s) return ''
  const m = s.match(/^(1|0|½|\+|-)[-:–](1|0|½|\+|-)(.*)$/)
  if (m) return `${m[1]} - ${m[2]}${m[3] ? ` ${m[3].toUpperCase()}` : ''}`
  return s
}

/** "IM Tao, Trevor" → title IM, name "Tao, Trevor". */
function splitTitle(name: string, title: string): { name: string; title: string } {
  const m = name.match(/^([A-Z]{2,3})\s+(.+)$/)
  if (!title && m && TITLES.includes(m[1])) return { title: m[1], name: m[2] }
  return { name, title: title.toUpperCase() }
}

const isBye = (s: string) => /^\(?\s*(bye|half[- ]?point bye|full[- ]?point bye|not paired|absent|free|spielfrei)\s*\)?$/i.test(s.trim())

export interface ParsedRound {
  round: number | null
  title: string
  boards: PairingBoard[]
}

const WHITE = /^(white|whiteplayer|weiss|w)$/
const BLACK = /^(black|blackplayer|schwarz|b)$/

/**
 * Finds the header row with White and Black columns. Columns left of the result belong to White,
 * right of it to Black – so repeated names like "Pts" or "Fed" are told apart.
 */
export async function readPairings(file: File): Promise<ParsedRound> {
  const grid = await readGrid(file)
  let h = -1
  let cells: string[] = []
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    cells = grid[i].map((c) => norm(str(c)))
    if (cells.some((c) => WHITE.test(c)) && cells.some((c) => BLACK.test(c))) {
      h = i
      break
    }
  }
  if (h < 0) throw new Error('No White / Black columns found. Export the round’s pairings from Vega or Swiss-Manager as .csv or .xlsx.')

  const wi = cells.findIndex((c) => WHITE.test(c))
  const bi = cells.findIndex((c) => BLACK.test(c))
  let ri = cells.findIndex((c, i) => i > wi && i < bi && /^(res|result|results|score|ergebnis)$/.test(c))
  const boardI = cells.findIndex((c) => /^(bo|board|bd|table|brd|tisch)$/.test(c))
  if (ri < 0) ri = Math.floor((wi + bi) / 2)

  // For each side, the nearest matching column on that side of the result.
  const sideCol = (side: 'w' | 'b', re: RegExp) => {
    const idx = cells.map((c, i) => (re.test(c) && (side === 'w' ? i < ri : i > ri) ? i : -1)).filter((i) => i >= 0)
    if (!idx.length) return -1
    const anchor = side === 'w' ? wi : bi
    return idx.sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))[0]
  }
  const cols = (side: 'w' | 'b') => ({
    name: side === 'w' ? wi : bi,
    pts: sideCol(side, /^(pts|points|pkt|score)$/),
    fed: sideCol(side, /^(fed|federation|country|nat)$/),
    sno: sideCol(side, /^(no|sno|snr|nr|num|id|startno)$/),
    title: sideCol(side, /^(tit|title|ti)$/),
  })
  const W = cols('w')
  const B = cols('b')
  const cell = (r: unknown[], i: number) => (i >= 0 ? str(r[i]) : '')
  const side = (r: unknown[], c: ReturnType<typeof cols>): PairingSide => {
    const t = splitTitle(cell(r, c.name), cell(r, c.title))
    return { sno: cell(r, c.sno).replace(/\D/g, ''), title: t.title, name: t.name, fed: cell(r, c.fed).toUpperCase().slice(0, 3), pts: cell(r, c.pts).replace(',', '.') }
  }

  const boards: PairingBoard[] = []
  for (const r of grid.slice(h + 1)) {
    const white = cell(r, W.name)
    if (!white) continue
    const blackName = cell(r, B.name)
    const bye = !blackName || isBye(blackName) || isBye(white)
    const w = side(r, W)
    if (isBye(white) && blackName) Object.assign(w, side(r, B))
    const n = Number(cell(r, boardI).replace(/\D/g, ''))
    boards.push({
      board: n > 0 ? n : boards.length + 1,
      white: w,
      black: bye ? null : side(r, B),
      result: fmtResult(cell(r, ri)),
    })
  }
  if (!boards.length) throw new Error('No boards found below the header row.')

  const above = grid.slice(0, h).map((r) => r.map(str).filter(Boolean).join(', ')).filter(Boolean)
  const title = above.find((t) => /round|runde|rd\.?\s*\d/i.test(t)) ?? ''
  const num = (title.match(/(?:round|runde|rd\.?)\s*(\d+)/i) ?? file.name.match(/(?:round|rnd|rd|r)[\s_-]*(\d+)/i))?.[1]
  return { round: num ? Number(num) : null, title, boards }
}

// ---------- TRF (FIDE Tournament Report File) ----------

const SCORE: Record<string, number> = { '1': 1, '+': 1, W: 1, F: 1, U: 1, '=': 0.5, D: 0.5, H: 0.5, '0': 0, '-': 0, L: 0, Z: 0 }
/** White's result letter as shown on the board. */
const GAME: Record<string, string> = { '1': '1 - 0', W: '1 - 0', '0': '0 - 1', L: '0 - 1', '=': '½ - ½', D: '½ - ½', '+': '+ - -', '-': '- - +' }

interface TrfBlock {
  opponent: number
  colour: string
  result: string
}

/** The fixed columns of a player's "001" line; each round is a 10-character block from column 92. */
function trfPlayer(line: string, entries: EventEntry[]) {
  const name = line.slice(14, 47).trim()
  const fideId = line.slice(57, 68).trim()
  const blocks: (TrfBlock | null)[] = []
  for (let i = 91; i < line.length; i += 10) {
    const b = line.slice(i, i + 8)
    blocks.push(b.trim() ? { opponent: Number(b.slice(0, 4)) || 0, colour: b.slice(5, 6).toLowerCase(), result: b.slice(7, 8).toUpperCase() } : null)
  }
  const entry = (fideId && Number(fideId) ? entries.find((x) => x.fideId.trim() === fideId) : undefined) ?? entries.find((x) => nameKey(x.name) === nameKey(name))
  return { sno: Number(line.slice(4, 8)), title: line.slice(10, 13).trim().toUpperCase(), name, fed: line.slice(53, 56).trim().toUpperCase(), entryId: entry?.id, blocks }
}

export function readTrf(text: string, entries: EventEntry[]) {
  const players = text.split(/\r?\n/).filter((l) => l.startsWith('001')).map((l) => trfPlayer(l, entries))
  if (!players.length) throw new Error('No players found. Export the tournament from Vega or Swiss-Manager as a TRF file.')
  const bySno = new Map(players.map((p) => [p.sno, p]))
  const points = new Map(players.map((p) => [p.sno, 0]))
  const rounds: (ParsedRound & { round: number })[] = []
  const total = Math.max(...players.map((p) => p.blocks.length))

  for (let r = 0; r < total; r++) {
    const side = (p: (typeof players)[number]): PairingSide => ({ entryId: p.entryId, sno: String(p.sno), title: p.title, name: p.name, fed: p.fed, pts: String(points.get(p.sno)) })
    const games: PairingBoard[] = []
    const byes: PairingBoard[] = []
    for (const p of players) {
      const b = p.blocks[r]
      if (!b) continue
      const opp = bySno.get(b.opponent)
      if (opp) {
        if (b.colour === 'w') games.push({ board: 0, white: side(p), black: side(opp), result: GAME[b.result] ?? '' })
      } else {
        const half = b.result === 'H'
        const full = 'FU+'.includes(b.result) && b.result !== ''
        byes.push({ board: 0, white: side(p), black: null, result: half ? '½' : full ? '1' : '0', byeKind: half ? 'half' : full ? 'pab' : 'zero' })
      }
    }
    // Later rounds in the file with only absences haven't been paired yet.
    if (!games.length && !byes.some((b) => b.byeKind !== 'zero')) continue
    const top = (b: PairingBoard) => Math.max(Number(b.white.pts), Number(b.black?.pts ?? 0))
    games.sort((a, b) => top(b) - top(a) || Number(a.white.sno) - Number(b.white.sno))
    rounds.push({ round: r + 1, title: `Pairing of round ${r + 1}`, boards: [...games, ...byes].map((b, i) => ({ ...b, board: i + 1 })) })
    for (const p of players) points.set(p.sno, (points.get(p.sno) ?? 0) + (SCORE[p.blocks[r]?.result ?? ''] ?? 0))
  }
  if (!rounds.length) throw new Error('This TRF file has no rounds yet.')

  const startNumbers: Record<string, number> = {}
  for (const p of players) if (p.entryId) startNumbers[p.entryId] = p.sno
  return { rounds, startNumbers, unmatched: players.filter((p) => !p.entryId).map((p) => p.name) }
}
