import { uid } from '../lib/uid'
import type { ContactConfig, HomeConfig, PageButton, PageConfig, PageHeadConfig, PageId, PageImage, PageLink } from '../types'
import { PAGES } from './menus'

export const blankImage = (overlay = 45): PageImage => ({ assetId: null, fileName: null, overlay, tone: 'auto', luminance: null })

const blankHead = (): PageHeadConfig => ({ menuLabel: '', title: '', intro: '', image: blankImage(), height: 0 })

/** The preview in Page Config stands for a window this tall. */
const PREVIEW_WINDOW = 720

/** Minimum height of a section from its percent of the window (0 = fit the content). */
export const sectionHeight = (percent: number, preview?: boolean) => (!percent ? undefined : preview ? `${(percent / 100) * PREVIEW_WINDOW}px` : `${percent}vh`)

export const newButton = (label = 'Button', link: PageLink = { kind: 'none' }, id = uid('btn')): PageButton => ({ id, label, link })

const page = (p: PageId): PageLink => ({ kind: 'page', page: p })

// Starter items have fixed ids, so the same defaults always compare equal.
const defaultHome = (): HomeConfig => ({
  hero: {
    enabled: true,
    title: 'Play, learn and compete\nat your local chess club',
    text: 'Weekly tournaments, coaching and social nights for players of every level, from first moves to titled competition.',
    image: blankImage(),
    height: 100,
    buttons: [newButton('Upcoming events', page('events'), 'btn-hero-1'), newButton('Contact us', page('contact'), 'btn-hero-2')],
  },
  gallery: {
    enabled: true,
    title: 'What we offer',
    text: 'Everything you need to enjoy the game, whichever way you like to play it.',
    height: 0,
    items: [
      ['Rated tournaments', 'FIDE and ACF rated events through the year, run by qualified arbiters.'],
      ['Coaching', 'Group lessons and training nights to sharpen your openings, tactics and endgames.'],
      ['Junior chess', 'A friendly start for young players, with squads for those ready to compete.'],
      ['Social nights', 'Casual games, blitz and good company every week. Everyone is welcome.'],
    ].map(([title, text], i) => ({ id: `gal-${i + 1}`, title, text, assetId: null, fileName: null, button: newButton('View details', page('events'), `btn-gal-${i + 1}`) })),
  },
  emphasis: {
    enabled: true,
    title: 'Why join us',
    image: blankImage(60),
    height: 0,
    items: [
      ['All levels', 'Beginners and titled players share the same boards and the same love of the game.'],
      ['Fair play', 'Experienced arbiters and clear rules at every club event.'],
      ['Regular events', 'A full calendar means there is always a next game to look forward to.'],
      ['Community', 'Make friends, find training partners and represent the club in team events.'],
    ].map(([title, text], i) => ({ id: `emp-${i + 1}`, title, text })),
    button: newButton('Become a member', page('profile'), 'btn-emphasis'),
  },
  projects: {
    enabled: true,
    title: 'Latest news',
    height: 0,
    inset: 120,
    padding: 32,
    items: [
      ['NEWS 01', 'Club championship', 'Our flagship event returns. See the schedule and enter online from the events calendar.'],
      ['NEWS 02', 'Junior squad', 'Training for our junior squad starts soon, with places for new players.'],
      ['NEWS 03', 'New members welcome', 'Come along to a social night and try the club before you join.'],
      ['NEWS 04', 'Results and pairings', 'Follow every round of our tournaments as pairings and results are published.'],
    ].map(([label, title, text], i) => ({ id: `prj-${i + 1}`, label, title, text, assetId: null, fileName: null, button: newButton('View details', page('events'), `btn-prj-${i + 1}`) })),
  },
})

const defaultContact = (): ContactConfig => ({
  title: 'Contact Us',
  text: 'Questions about membership, tournaments or coaching? Send us a message and we’ll get back to you.',
  height: 0,
  details: 'Your club name\nVenue address\nclub@example.com\nPhone number',
  links: [],
  inquiryTypes: ['General enquiry', 'Membership', 'Tournaments', 'Coaching', 'Junior chess'],
  thanks: 'Thanks for getting in touch. We’ll reply as soon as we can.',
  notifyEmail: '',
  autoReply: 'Thanks for contacting us. We have your message and will reply as soon as we can.',
})

export function builtinPages(): PageConfig[] {
  return [
    {
      id: 'pages-default',
      name: 'Pages',
      builtin: true,
      heads: Object.fromEntries(PAGES.map((p) => [p.id, blankHead()])) as Record<PageId, PageHeadConfig>,
      home: defaultHome(),
      contact: defaultContact(),
      profileFields: {},
      calendar: {},
    },
  ]
}

/** Saved config brought up to date: pages and parts added in later versions get their defaults. */
export function normalizePages(p: PageConfig): PageConfig {
  const fresh = builtinPages()[0]
  const home = p.home ?? fresh.home
  return {
    ...fresh,
    ...p,
    heads: Object.fromEntries(PAGES.map((x) => [x.id, { ...blankHead(), ...p.heads?.[x.id] }])) as Record<PageId, PageHeadConfig>,
    home: { hero: { ...fresh.home.hero, ...home.hero }, gallery: { ...fresh.home.gallery, ...home.gallery }, emphasis: { ...fresh.home.emphasis, ...home.emphasis }, projects: { ...fresh.home.projects, ...home.projects } },
    contact: { ...fresh.contact, ...p.contact },
  }
}

/** Every uploaded file the config uses. */
export function pageAssets(p: PageConfig): string[] {
  const { hero, gallery, emphasis, projects } = p.home
  return [...Object.values(p.heads).map((h) => h.image.assetId), hero.image.assetId, emphasis.image.assetId, ...gallery.items.map((i) => i.assetId), ...projects.items.map((i) => i.assetId)].filter((x): x is string => !!x)
}

/** Dark or light once the overlay is taken into account. An image-free section counts as dark (its placeholder is). */
export function isDarkImage(img: PageImage): boolean {
  if (img.tone !== 'auto') return img.tone === 'dark'
  if (!img.assetId || img.luminance == null) return true
  return img.luminance * (1 - img.overlay / 100) < 0.5
}

/** Only web and contact addresses become links (never javascript: and the like). */
export function safeUrl(url: string): string | null {
  const u = url.trim()
  if (!u) return null
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? null : `https://${u}`
}

/** Average brightness of an image, 0–1 (null when it can't be read, e.g. a broken file). */
export function measureLuminance(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    img.onerror = () => done(null)
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return done(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let sum = 0
        for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        done(sum / (size * size) / 255)
      } catch {
        done(null)
      }
    }
    img.src = url
  })
}

// ---------- Profile fields ----------

/** Fields with an "editable after the first save" switch. Join and renew dates aren't here: they are Admin only. */
export const PROFILE_FIELD_GROUPS: { name: string; fields: { key: string; label: string }[] }[] = [
  {
    name: 'Personal',
    fields: [
      { key: 'photo', label: 'Photo' }, { key: 'prefix', label: 'Prefix' }, { key: 'firstName', label: 'First name' }, { key: 'middleName', label: 'Middle name' },
      { key: 'lastName', label: 'Last name' }, { key: 'dob', label: 'Date of birth' }, { key: 'sex', label: 'Sex' }, { key: 'citizenship', label: 'Citizenship' },
    ],
  },
  {
    name: 'Chess level',
    fields: [
      { key: 'fideId', label: 'FIDE number' }, { key: 'acfId', label: 'ACF ID' }, { key: 'federation', label: 'Federation' }, { key: 'title', label: 'Title' },
      { key: 'fideStandard', label: 'FIDE Standard' }, { key: 'fideRapid', label: 'FIDE Rapid' }, { key: 'fideBlitz', label: 'FIDE Blitz' }, { key: 'kFide', label: 'K FIDE' }, { key: 'acfRating', label: 'ACF rating' },
    ],
  },
  { name: 'Contact', fields: [{ key: 'email', label: 'Email address' }, { key: 'phone', label: 'Phone' }] },
  {
    name: 'Address',
    fields: [
      { key: 'apartment', label: 'Apartment, suite' }, { key: 'street', label: 'Street address' }, { key: 'suburb', label: 'Suburb' }, { key: 'state', label: 'State' },
      { key: 'postcode', label: 'Postcode' }, { key: 'country', label: 'Country' },
    ],
  },
  { name: 'Other', fields: [{ key: 'occupation', label: 'Occupation' }, { key: 'clubs', label: 'Chess club(s)' }] },
]
