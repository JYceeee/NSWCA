// Players template (see PLAYER_COLUMNS): download and import.
import { TITLES } from './pairings'
import { loadExcel, parseDate, readGrid, str } from './spreadsheet'
import { nameKey } from './results'
import type { EventEntry } from '../types'

export const PLAYER_COLUMNS = ['Name', 'Federation', 'DOB', 'Gender', 'Title', 'FIDE ID', 'K FIDE', 'FIDE Standard', 'FIDE Rapid', 'FIDE Blitz', 'ACF ID', 'Division', 'Email'] as const
type Col = (typeof PLAYER_COLUMNS)[number]

export async function downloadPlayersTemplate() {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Players', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow([...PLAYER_COLUMNS]).font = { bold: true }
  ws.addRow(['Surname, Firstname', 'AUS', '25/10/2005', 'M', 'FM', '3209660', '20', '2150', '2100', '2050', '3123456', 'Open', 'player@example.com'])
  ws.addRow(['Surname, Firstname', 'NZL', '03/04/2012', 'F', '', '', '40', '', '', '', '', '', ''])
  ws.addRow([])
  ws.addRow(['Name is required. DOB day first (25/10/2005). Gender M or F. Title GM, IM, FM, CM, WGM, WIM, WFM or WCM. K FIDE (10, 20 or 40), the FIDE Standard, Rapid and Blitz ratings and ACF ID are optional. Division must match one of the tournament’s divisions (empty = chosen when importing). Email links the entry to the player’s own profile. Leave unknown cells empty.']).font = {
    italic: true,
    color: { argb: 'FF777777' },
  }
  ;[24, 11, 12, 8, 7, 12, 8, 13, 11, 11, 11, 16, 28].forEach((w, i) => (ws.getColumn(i + 1).width = w))
  ws.getColumn(3).numFmt = '@'
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = 'players-template.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export interface PlayerRow {
  row: number
  status: 'new' | 'duplicate' | 'problem'
  reason?: string
  entry?: EventEntry
  name: string
}

/** Same email, FIDE ID or ACF ID, or same name with the same (or a missing) date of birth = already entered. */
type Who = Pick<EventEntry, 'name' | 'fideId' | 'acfId' | 'dob' | 'email'>
export const isSamePlayer = (a: Who, b: Who) =>
  (!!a.email && a.email.toLowerCase() === (b.email ?? '').toLowerCase()) ||
  (!!a.fideId && a.fideId === b.fideId) ||
  (!!a.acfId && a.acfId === b.acfId) ||
  (nameKey(a.name) === nameKey(b.name) && (!a.dob || !b.dob || a.dob === b.dob))

/** Checks one player (from the Add form or a file row). Returns a reason when it can't be added. */
export function checkPlayer(p: Partial<Record<Col, string>>): { entry?: Omit<EventEntry, 'id' | 'at'>; reason?: string } {
  const name = (p.Name ?? '').trim()
  if (!name) return { reason: 'Missing name' }
  if (/^surname,\s*firstname$/i.test(name)) return { reason: 'Example row from the template – replace or delete it' }
  const email = (p.Email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { reason: `Can’t read email “${email}”` }
  let dob = ''
  if ((p.DOB ?? '').trim()) {
    const d = parseDate(p.DOB)
    if (!d) return { reason: `Can’t read DOB “${p.DOB}”` }
    dob = d
  }
  const digits = (k: Col, max: number, label: string) => {
    const v = (p[k] ?? '').trim()
    if (v && !new RegExp(`^\\d{1,${max}}$`).test(v)) throw new Error(`${label} should be a number, not “${v}”`)
    return v
  }
  try {
    const title = (p.Title ?? '').trim().toUpperCase()
    if (title && !TITLES.includes(title)) return { reason: `Unknown title “${p.Title}”` }
    const g = (p.Gender ?? '').trim().toUpperCase()
    const gender = g.startsWith('M') ? 'M' : g.startsWith('F') || g.startsWith('W') ? 'F' : g
    const kFide = digits('K FIDE', 2, 'K FIDE')
    if (kFide && !['10', '20', '40'].includes(kFide)) return { reason: 'K FIDE should be 10, 20 or 40' }
    return {
      entry: {
        name,
        email,
        fed: (p.Federation ?? '').trim().toUpperCase().slice(0, 3),
        dob,
        gender,
        title,
        fideId: digits('FIDE ID', 10, 'FIDE ID'),
        kFide,
        fideStandard: digits('FIDE Standard', 4, 'FIDE Standard rating'),
        fideRapid: digits('FIDE Rapid', 4, 'FIDE Rapid rating'),
        fideBlitz: digits('FIDE Blitz', 4, 'FIDE Blitz rating'),
        acfId: digits('ACF ID', 10, 'ACF ID'),
        acfRating: '',
        division: '',
      },
    }
  } catch (e) {
    return { reason: (e as Error).message }
  }
}

/** Reads a players file and checks every row against the tournament's entries. */
export async function readPlayers(file: File, existing: EventEntry[], divisions: { id: string; name: string }[], newId: () => string): Promise<PlayerRow[]> {
  const grid = await readGrid(file)
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '')
  const h = grid.findIndex((r) => r.some((c) => norm(str(c)) === 'name'))
  if (h < 0) throw new Error('No “Name” column found. Use the players template from Admin › Document.')
  const header = grid[h].map((c) => norm(str(c)))
  const index = Object.fromEntries(PLAYER_COLUMNS.map((c) => [c, header.indexOf(norm(c))])) as Record<Col, number>
  // Older files have one "FIDE rating" column: the standard rating.
  if (index['FIDE Standard'] < 0) index['FIDE Standard'] = header.indexOf('fiderating')
  const seen: EventEntry[] = [...existing]
  const rows: PlayerRow[] = []
  grid.slice(h + 1).forEach((r, i) => {
    if (!r.some((c) => str(c))) return
    const raw: Partial<Record<Col, string>> = Object.fromEntries(PLAYER_COLUMNS.filter((c) => index[c] >= 0).map((c) => [c, str(r[index[c]])]))
    // Excel date cells come through as dates: turn them into yyyy-MM-dd, which parseDate reads.
    if (index.DOB >= 0 && r[index.DOB] instanceof Date) raw.DOB = parseDate(r[index.DOB]) ?? ''
    const row = h + i + 2
    const name = String(raw.Name ?? '')
    // The template's note line has text only in the first column.
    if (r.filter((c) => str(c)).length === 1 && name.length > 60) return
    const { entry, reason } = checkPlayer(raw)
    if (!entry) return rows.push({ row, status: 'problem', reason, name })
    // Division by name; empty = the one chosen when importing. Ignored if the tournament has no divisions.
    const dname = (raw.Division ?? '').trim()
    let division = ''
    if (dname && divisions.length) {
      const dv = divisions.find((x) => x.name.trim().toLowerCase() === dname.toLowerCase())
      if (!dv) return rows.push({ row, status: 'problem', reason: `Unknown division “${dname}” – this tournament has ${divisions.map((x) => x.name).join(', ')}`, name })
      division = dv.id
    }
    const full: EventEntry = { ...entry, division, id: newId(), at: new Date().toISOString() }
    const dup = seen.find((x) => isSamePlayer(x, full))
    if (dup) return rows.push({ row, status: 'duplicate', reason: `Already entered as “${dup.name}”`, entry: full, name })
    seen.push(full)
    rows.push({ row, status: 'new', entry: full, name })
  })
  if (!rows.length) throw new Error('No players found below the header row.')
  return rows
}

/** How an entry was made; older entries are inferred (an email means the player signed up). */
export const sourceOf = (x: EventEntry): NonNullable<EventEntry['source']> => x.source ?? (x.email ? 'signup' : 'import')
export const SOURCE_LABEL: Record<NonNullable<EventEntry['source']>, string> = { signup: 'Signed up', import: 'Imported', manual: 'Added by hand' }
export const isOrganiserAdded = (x: EventEntry) => sourceOf(x) !== 'signup'

/** All entries in the players-template columns – can be imported into another tournament. */
export async function exportPlayers(entries: EventEntry[], divisionName: (id: string) => string, fileName: string) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Players', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow([...PLAYER_COLUMNS]).font = { bold: true }
  const dmy = (d?: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '')
  for (const x of entries)
    ws.addRow([x.name, x.fed ?? '', dmy(x.dob), x.gender ?? '', x.title ?? '', x.fideId, x.kFide ?? '', x.fideStandard ?? '', x.fideRapid ?? '', x.fideBlitz ?? '', x.acfId, divisionName(x.division), x.email])
  ;[24, 11, 12, 8, 7, 12, 8, 13, 11, 11, 11, 16, 28].forEach((w, i) => (ws.getColumn(i + 1).width = w))
  ws.getColumn(3).numFmt = '@'
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
