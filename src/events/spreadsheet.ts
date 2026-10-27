// Excel / CSV import and export of events. ExcelJS is loaded only when used.
import { differenceInCalendarDays, format } from 'date-fns'
import { fmtDate, timeLabel, toDate, toMinutes } from '../data/events'
import { toPlain } from '../lib/richtext'
import type { TokenKey } from '../data/tokens'
import type { CalEvent, EventCategory } from '../types'

export const COLUMNS = ['Name', 'Start date', 'End date', 'All day', 'Start time', 'End time', 'Location', 'Category', 'Description'] as const
type Column = (typeof COLUMNS)[number]
type Raw = Partial<Record<Column, unknown>>

export const loadExcel = () => import('exceljs').then((m) => (m.default ?? m) as typeof import('exceljs'))

// ---------- Reading cells ----------

/** ExcelJS cell values can be rich text, formulas or hyperlinks – reduce to a plain value. */
function plain(v: unknown): unknown {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if ('result' in o) return plain(o.result)
    if ('text' in o) return plain(o.text)
  }
  return v
}

export const str = (v: unknown) => (v == null ? '' : String(plain(v)).trim())
const pad = (n: number) => String(n).padStart(2, '0')
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

/** yyyy-MM-dd, or null. Day first: 25/10/2026; also 2026-10-25, Excel date cells and serial numbers. */
export function parseDate(v: unknown): string | null {
  v = plain(v)
  if (v instanceof Date) return isNaN(+v) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  if (typeof v === 'number' && v > 59) return parseDate(new Date(EXCEL_EPOCH + Math.floor(v) * 86400000))
  const s = str(v)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  let y: number, mo: number, d: number
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]]
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) [d, mo, y] = [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]]
  else return null
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? fmtDate(date) : null
}

/** HH:mm, '' for blank, or null when unreadable. Accepts 2:00 PM, 2pm, 14:00, Excel times. */
export function parseTime(v: unknown): string | null {
  v = plain(v)
  if (v == null || v === '') return ''
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`
  if (typeof v === 'number') {
    const mins = Math.round((v % 1) * 1440) % 1440
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
  }
  const m = str(v).toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm|a|p)?$/)
  if (!m) return str(v) ? null : ''
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  const ap = m[3]?.[0]
  if (ap) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (ap === 'p' ? 12 : 0)
  } else if (!m[2]) return null // a bare number isn't a time
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/** true / false, or null when blank. */
function parseBool(v: unknown): boolean | null {
  const s = str(v).toLowerCase()
  if (!s) return null
  if (['yes', 'y', 'true', '1', 'all day'].includes(s)) return true
  if (['no', 'n', 'false', '0'].includes(s)) return false
  return null
}

/** Simple CSV with quoted fields and "" escapes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') row.push(cell), (cell = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell), rows.push(row), (row = []), (cell = '')
    } else cell += ch
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** First sheet of an .xlsx, or a .csv, as rows of cell values. Throws a readable message. */
export async function readGrid(file: File): Promise<unknown[][]> {
  let grid: unknown[][]
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') grid = parseCsv((await file.text()).replace(/^﻿/, ''))
  else if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = await loadExcel()
    const wb = new ExcelJS.Workbook()
    try {
      await wb.xlsx.load(await file.arrayBuffer())
    } catch {
      throw new Error('This file could not be read as an Excel workbook.')
    }
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('The workbook has no sheets.')
    grid = []
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const vals = r.values as unknown[] // 1-based
      grid[n - 1] = vals.slice(1)
    })
    grid = Array.from(grid, (r) => r ?? [])
  } else if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files aren’t supported – open it in Excel and save as .xlsx first.')
  else throw new Error('Choose an .xlsx or .csv file.')
  return grid
}

/** Rows keyed by column name, from the first sheet (or the CSV). Throws a readable message. */
export async function readFile(file: File): Promise<{ rows: Raw[]; rowNumbers: number[] }> {
  const grid = await readGrid(file)
  const headerAt = grid.findIndex((r) => r.some((c) => str(c)))
  if (headerAt < 0) throw new Error('The file is empty.')
  const header = grid[headerAt].map((c) => str(c).toLowerCase())
  const index = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c.toLowerCase())])) as Record<Column, number>
  const missing = (['Name', 'Start date'] as Column[]).filter((c) => index[c] < 0)
  if (missing.length) throw new Error(`Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Use the template’s column names in the first row.`)

  const rows: Raw[] = []
  const rowNumbers: number[] = []
  grid.slice(headerAt + 1).forEach((r, i) => {
    if (!r.some((c) => str(c))) return
    rows.push(Object.fromEntries(COLUMNS.filter((c) => index[c] >= 0).map((c) => [c, r[index[c]]])))
    rowNumbers.push(headerAt + i + 2)
  })
  return { rows, rowNumbers }
}

// ---------- Checking rows ----------

export interface ImportRow {
  row: number
  status: 'new' | 'update' | 'problem'
  reason?: string
  event?: CalEvent
  /** Name of a category this row will create. */
  newCategory?: string
  /** Unusual things about an importable row (see addWarnings). */
  warnings: string[]
  raw: Raw
}

const sameEvent = (a: CalEvent, b: CalEvent) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.startDate === b.startDate && (a.allDay && b.allDay ? true : !a.allDay && !b.allDay && a.startTime === b.startTime)

export function checkRows(rows: Raw[], rowNumbers: number[], existing: CalEvent[], categories: EventCategory[], newId: () => string): ImportRow[] {
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]))
  const pending = new Map<string, string>() // new category name (lower) -> placeholder id
  return rows.map((raw, i) => {
    const row = rowNumbers[i]
    const fail = (reason: string): ImportRow => ({ row, status: 'problem', reason, raw, warnings: [] })
    const name = str(raw.Name)
    if (!name) return fail('Missing name')
    const startDate = parseDate(raw['Start date'])
    if (!startDate) return fail(str(raw['Start date']) ? `Can’t read start date “${str(raw['Start date'])}”` : 'Missing start date')
    const endDate = str(raw['End date']) ? parseDate(raw['End date']) : startDate
    if (!endDate) return fail(`Can’t read end date “${str(raw['End date'])}”`)
    if (endDate < startDate) return fail('End date is before the start date')
    const startTime = parseTime(raw['Start time'])
    const endTime = parseTime(raw['End time'])
    if (startTime === null) return fail(`Can’t read start time “${str(raw['Start time'])}”`)
    if (endTime === null) return fail(`Can’t read end time “${str(raw['End time'])}”`)
    const flag = parseBool(raw['All day'])
    if (flag === null && str(raw['All day'])) return fail(`“All day” should be Yes or No, not “${str(raw['All day'])}”`)
    const allDay = flag ?? (!startTime && !endTime)
    if (!allDay && !startTime) return fail('Missing start time (or set All day to Yes)')
    const st = allDay ? '09:00' : startTime
    const et = allDay ? '17:00' : endTime || format(new Date(2000, 0, 1, 0, Math.min(toMinutes(st) + 60, 1439)), 'HH:mm')
    if (!allDay && endDate === startDate && et <= st) return fail('End time is before the start time')

    const catName = str(raw.Category)
    let category = ''
    let newCategory: string | undefined
    if (catName) {
      const key = catName.toLowerCase()
      category = byName.get(key) ?? pending.get(key) ?? ''
      if (!category) {
        category = `new:${key}`
        pending.set(key, category)
        newCategory = catName
      }
    }
    const event: CalEvent = {
      id: newId(), name, startDate, endDate, allDay, startTime: st, endTime: et,
      location: str(raw.Location), description: str(raw.Description), category,
    }
    const match = existing.find((e) => sameEvent(e, event))
    return match ? { row, status: 'update', event: { ...event, id: match.id }, raw, newCategory, warnings: [] } : { row, status: 'new', event, raw, newCategory, warnings: [] }
  })
}

// ---------- Warnings ----------

const DAY0 = new Date(2000, 0, 1)
/** Event as [start, end) in minutes; all-day events cover their whole days. */
function span(e: CalEvent): [number, number] {
  const d0 = differenceInCalendarDays(toDate(e.startDate), DAY0) * 1440
  const d1 = differenceInCalendarDays(toDate(e.endDate), DAY0) * 1440
  return e.allDay ? [d0, d1 + 1440] : [d0 + toMinutes(e.startTime), d1 + toMinutes(e.endTime)]
}
const overlaps = (a: CalEvent, b: CalEvent) => {
  const [as, ae] = span(a)
  const [bs, be] = span(b)
  return as < be && bs < ae
}
const when = (e: CalEvent) => `${timeLabel(e)}, ${format(toDate(e.startDate), 'EEE d MMM')}`
const key = (e: CalEvent) => `${e.name.trim().toLowerCase()}|${e.startDate}|${e.allDay ? 'all' : e.startTime}`

/** Flags overlaps (with the calendar and within the file) and anything unusual, on importable rows. */
export function addWarnings(rows: ImportRow[], existing: CalEvent[]): ImportRow[] {
  const ok = rows.filter((r) => r.status !== 'problem' && r.event)
  // Events this import updates are compared in their new form, as file rows.
  const updating = new Set(ok.filter((r) => r.status === 'update').map((r) => r.event!.id))
  const calendar = existing.filter((e) => !updating.has(e.id))
  const today = fmtDate(new Date())
  return rows.map((r) => {
    if (r.status === 'problem' || !r.event) return r
    const e = r.event
    const w: string[] = []
    for (const x of calendar) if (overlaps(e, x)) w.push(`Overlaps “${x.name}” (${when(x)})`)
    for (const o of ok) if (o !== r && overlaps(e, o.event!)) w.push(`Overlaps row ${o.row} “${o.event!.name}”`)
    const dupes = ok.filter((o) => o !== r && key(o.event!) === key(e))
    if (dupes.length) w.push(`Same as row ${dupes.map((o) => o.row).join(', ')} – appears more than once in the file`)
    const sameDay = existing.filter((x) => !updating.has(x.id) && x.name.trim().toLowerCase() === e.name.trim().toLowerCase() && x.startDate === e.startDate)
    for (const x of sameDay) w.push(`Same name as an existing event that day at a different time (${timeLabel(x)}) – this adds a second one`)
    if (e.startDate < today) w.push('Starts in the past')
    const days = differenceInCalendarDays(toDate(e.endDate), toDate(e.startDate)) + 1
    if (days > 14) w.push(`Very long: ${days} days`)
    if (!e.allDay) {
      const [s, f] = span(e)
      const mins = f - s
      if (mins > 12 * 60) w.push(`Very long: ${Math.round(mins / 6) / 10} hours`)
      if (mins < 15) w.push(`Very short: ${mins} minutes`)
      if (toMinutes(e.startTime) < 360 || toMinutes(e.endTime) < 360) w.push('Starts or ends between 12 AM and 6 AM')
    }
    return { ...r, warnings: w }
  })
}

const CATEGORY_TOKENS: TokenKey[] = ['chart-1', 'chart-2', 'danger', 'secondary', 'primary', 'success', 'warning']

/** Applies checked rows: creates categories, updates matches, adds the rest. */
export function applyImport(rows: ImportRow[], events: CalEvent[], categories: EventCategory[], newCatId: () => string) {
  const cats = [...categories]
  const ids = new Map<string, string>()
  for (const r of rows) {
    const key = r.event?.category
    if (!r.newCategory || !key || ids.has(key)) continue
    const used = new Set(cats.map((c) => c.color.token))
    const token = CATEGORY_TOKENS.find((t) => !used.has(t)) ?? CATEGORY_TOKENS[cats.length % CATEGORY_TOKENS.length]
    const id = newCatId()
    ids.set(key, id)
    cats.push({ id, name: r.newCategory, color: { token, alpha: 100 } })
  }
  const list = [...events]
  for (const r of rows) {
    if (r.status === 'problem' || !r.event) continue
    const e = { ...r.event, category: ids.get(r.event.category) ?? r.event.category }
    const at = list.findIndex((x) => x.id === e.id || sameEvent(x, e))
    if (at >= 0) list[at] = { ...e, id: list[at].id }
    else list.push(e)
  }
  return { events: list, categories: cats }
}

// ---------- Writing ----------

const utcDate = (d: string) => {
  const x = toDate(d)
  return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()))
}
const dayFraction = (t: string) => toMinutes(t) / 1440

async function download(rows: (string | number | Date | null)[][], fileName: string) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Events', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.addRow([...COLUMNS])
  for (const r of rows) ws.addRow(r)
  ws.getRow(1).font = { bold: true }
  ws.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } }
  const fmt: Partial<Record<Column, string>> = { 'Start date': 'dd/mm/yyyy', 'End date': 'dd/mm/yyyy', 'Start time': 'h:mm AM/PM', 'End time': 'h:mm AM/PM' }
  COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1)
    if (fmt[c]) col.numFmt = fmt[c]!
    const longest = Math.max(c.length, ...rows.map((r) => (r[i] instanceof Date ? 10 : typeof r[i] === 'number' ? 8 : String(r[i] ?? '').length)))
    col.width = Math.min(60, longest + 3)
  })
  ws.getRow(1).numFmt = '@'
  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function exportEvents(events: CalEvent[], categories: EventCategory[], fileName: string) {
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? ''
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate) || Number(b.allDay) - Number(a.allDay) || a.startTime.localeCompare(b.startTime))
  return download(
    sorted.map((e) => [
      e.name, utcDate(e.startDate), utcDate(e.endDate), e.allDay ? 'Yes' : 'No',
      e.allDay ? null : dayFraction(e.startTime), e.allDay ? null : dayFraction(e.endTime),
      e.location, name(e.category), toPlain(e.description),
    ]),
    fileName,
  )
}

export function downloadTemplate() {
  const today = new Date()
  const d = (n: number) => utcDate(fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)))
  return download(
    [
      ['Club night', d(7), d(7), 'No', dayFraction('19:00'), dayFraction('22:00'), 'Club room', 'Social', 'Casual games, all welcome'],
      ['Weekend open', d(12), d(13), 'Yes', null, null, 'Town Hall', 'Tournament', 'Two-day event'],
    ],
    'events-template.xlsx',
  )
}
