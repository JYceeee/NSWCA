// Round pairings exported from Vega or Swiss-Manager (.csv / .xlsx).
import type { PairingBoard, PairingRound, PairingSide } from '../types'
import { nameKey } from './results'
import { loadExcel, readGrid, str } from './spreadsheet'

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

/** A round is finished when every game has a result (byes count as played). */
export const isFinished = (r: PairingRound) => r.boards.length > 0 && r.boards.every((b) => !b.black || b.result.trim())

const VAL: Record<string, number> = { '1': 1, '+': 1, '½': 0.5, '0': 0, '-': 0 }

/** Points White and Black scored on a board ("1 - 0", "½ - ½", "+ - -", bye "1"). */
export function boardScore(b: PairingBoard): [number, number] {
  const m = b.result.match(/^(1|0|½|\+|-)\s*-\s*(1|0|½|\+|-)/)
  if (m) return [VAL[m[1]], VAL[m[2]]]
  return [VAL[b.result.trim()] ?? 0, 0]
}

const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0)

export interface Standing {
  name: string
  points: number
  /** 1 = first; shared places have the same number. */
  place: number
  tied: boolean
}

/** Standings after the latest finished round: points before it (from the file) plus the game's score. */
export function standings(rounds: PairingRound[]): { after: number; table: Standing[] } | null {
  const last = [...rounds].filter(isFinished).sort((a, b) => b.round - a.round)[0]
  if (!last) return null
  const rows: { name: string; points: number }[] = []
  for (const b of last.boards) {
    const [w, k] = boardScore(b)
    rows.push({ name: b.white.name, points: num(b.white.pts) + w })
    if (b.black) rows.push({ name: b.black.name, points: num(b.black.pts) + k })
  }
  rows.sort((a, b) => b.points - a.points)
  const table = rows.map((r) => {
    const place = rows.findIndex((x) => x.points === r.points) + 1
    return { ...r, place, tied: rows.filter((x) => x.points === r.points).length > 1 }
  })
  return { after: last.round, table }
}

/** One player's line in the standings, found by name. */
export function standingOf(rounds: PairingRound[], name: string) {
  const s = standings(rounds)
  const me = s?.table.find((r) => nameKey(r.name) === nameKey(name))
  return s && me ? { ...me, of: s.table.length, after: s.after } : null
}

const TEMPLATE_HEADER = ['Bo.', 'No.', 'Fed', 'Tit', 'White Player', 'Pts', 'Result', 'Pts', 'No.', 'Tit', 'Black Player', 'Fed']

/** An .xlsx in the layout readPairings understands: title row, header, example boards (a result, an unplayed game, a bye). */
export async function downloadPairingTemplate() {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Round 1', { views: [{ state: 'frozen', ySplit: 3 }] })
  const today = new Date()
  const date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  ws.addRow([`Pairing of round 1, at 1000 of ${date}`]).font = { bold: true, size: 13 }
  ws.addRow([])
  ws.addRow(TEMPLATE_HEADER).font = { bold: true }
  ws.addRow([1, 1, 'AUS', 'IM', 'Surname, Firstname', 0, '1/2-1/2', 0, 5, 'FM', 'Surname, Firstname', 'AUS'])
  ws.addRow([2, 6, 'AUS', '', 'Surname, Firstname', 0, '1-0', 0, 2, '', 'Surname, Firstname', 'NZL'])
  ws.addRow([3, 3, 'AUS', 'CM', 'Surname, Firstname', 0, '', 0, 4, '', 'Surname, Firstname', 'AUS'])
  ws.addRow([4, 7, 'AUS', '', 'Surname, Firstname', 0, '1', 0, '', '', '( bye )', ''])
  ws.addRow([])
  ws.addRow(['Result: 1-0, 0-1, 1/2-1/2, +/- for forfeits; leave empty until played. Black Player "( bye )" for a bye. Pts = points before this round.']).font = { italic: true, color: { argb: 'FF777777' } }
  const widths = [6, 6, 6, 6, 26, 6, 10, 6, 6, 6, 26, 6]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = 'pairings-template.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
