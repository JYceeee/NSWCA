import type { TextStyle, TypographySet } from '../types'

type Row = Pick<TextStyle, 'id' | 'name' | 'description' | 'size' | 'weight' | 'sampleText'> & Partial<TextStyle>

const ROWS: Row[] = [
  { id: 'display1', name: 'Display 1', description: 'Hero numbers and status icons', size: 64, weight: 700, sampleText: 'Aa', lineHeight: 1.05 },
  { id: 'display2', name: 'Display 2', description: 'Names, card ID and portal status', size: 32, weight: 600, sampleText: 'Alex Chen', lineHeight: 1.15 },
  { id: 'stat', name: 'Stat number', description: 'Dashboard figures', size: 22, weight: 700, sampleText: '$12,480' },
  { id: 'h1', name: 'Heading 1', description: 'Page titles', size: 28, weight: 700, sampleText: 'Setting the Standard', lineHeight: 1.2 },
  { id: 'h2', name: 'Heading 2', description: 'Dialog titles, club name', size: 20, weight: 700, sampleText: 'Dialog title' },
  { id: 'h3', name: 'Heading 3', description: 'Card titles, folder names', size: 16, weight: 700, sampleText: 'Card title' },
  { id: 'p1', name: 'Paragraph 1', description: 'Body text, form fields', size: 15, weight: 400, sampleText: 'The quick brown fox jumps', lineHeight: 1.5 },
  { id: 'table', name: 'Table content', description: 'Text inside table rows', size: 14, weight: 400, sampleText: 'Alex Chen · $120.00' },
  { id: 'cardNumber', name: 'Card number', description: 'Big number on cards, e.g. "#3"', size: 36, weight: 800, sampleText: '#3', lineHeight: 1 },
  { id: 'cardText', name: 'Card text', description: 'Label beside a card number, e.g. "Club ranking"', size: 20, weight: 600, sampleText: 'Club ranking' },
  { id: 'caption', name: 'Caption', description: 'Muted captions and helper text', size: 13, weight: 400, sampleText: 'Updated 2 hours ago' },
  { id: 'button', name: 'Button', description: 'Button labels', size: 15, weight: 700, sampleText: 'Primary' },
  { id: 'pill', name: 'Pill', description: 'Status pills and tags', size: 13, weight: 600, sampleText: 'Confirmed' },
  { id: 'link', name: 'Link', description: 'Inline and standalone links', size: 15, weight: 500, sampleText: 'A link to somewhere' },
]

function makeRow(r: Row, font: string, sizeMap?: Record<string, number>): TextStyle {
  return {
    font,
    italic: false,
    uppercase: false,
    underline: false,
    strike: false,
    letterSpacing: 0,
    lineHeight: 1.3,
    sampleSize: null,
    builtin: true,
    ...r,
    size: sizeMap?.[r.id] ?? r.size,
  }
}

function makeSet(id: string, name: string, font: string, sizeMap?: Record<string, number>): TypographySet {
  const rows = ROWS.map((r) => makeRow(r, font, sizeMap))
  return { id, name, builtin: true, rows, rowDefaults: Object.fromEntries(rows.map((r) => [r.id, { ...r }])) }
}

export function builtinTypography(): TypographySet[] {
  return [
    makeSet('typography-1', 'Typography 1', 'Wix Madefor Display'),
    // Matches the compact app scale from the reference screenshot.
    makeSet('typography-2', 'Typography 2', 'Montserrat', {
      display1: 64, display2: 32, stat: 22, h1: 19, h2: 16, h3: 14, p1: 13, table: 14,
      cardNumber: 32, cardText: 18, caption: 12, button: 13, pill: 12, link: 13,
    }),
    makeSet('typography-3', 'Typography 3', 'Outfit'),
  ]
}

export function blankRow(id: string, font: string): TextStyle {
  return { ...makeRow({ id, name: 'New text style', description: 'Describe where it is used', size: 16, weight: 400, sampleText: 'Sample text' }, font), builtin: false }
}
