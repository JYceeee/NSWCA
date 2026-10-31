import type { TokenKey } from './data/tokens'

export type Tokens = Record<TokenKey, string>

/** A colour that either follows a palette token or is a custom hex. Alpha is 0–100. */
export interface ColorRef {
  token?: TokenKey
  hex?: string
  alpha: number
}

export type FieldValue = ColorRef | number | string | null

/** componentId -> fieldKey -> value. Only fields that differ from the schema default are stored. */
export type ComponentOverrides = Record<string, Record<string, FieldValue>>

export interface Palette {
  id: string
  name: string
  builtin: boolean
  tokens: Tokens
  /** Snapshot used by the per-swatch undo. */
  defaults: Tokens
  components: ComponentOverrides
  componentDefaults: ComponentOverrides
}

export interface TextStyle {
  id: string
  name: string
  description: string
  size: number
  font: string
  weight: number
  italic: boolean
  uppercase: boolean
  underline: boolean
  strike: boolean
  /** px */
  letterSpacing: number
  /** unitless multiplier */
  lineHeight: number
  sampleText: string
  /** null = same as size */
  sampleSize: number | null
  builtin: boolean
}

export interface TypographySet {
  id: string
  name: string
  builtin: boolean
  rows: TextStyle[]
  rowDefaults: Record<string, TextStyle>
}

export type BackgroundType = 'pattern' | 'image' | 'video'
export type PatternKind = 'dots' | 'grid' | 'diagonal' | 'waves' | 'noise' | 'checks'

export interface Background {
  id: string
  name: string
  builtin: boolean
  type: BackgroundType
  pattern: { kind: PatternKind; color: ColorRef; base: ColorRef; scale: number }
  image: { assetId: string | null; fileName: string | null; overlay: ColorRef; focalX: number; focalY: number; blur: number }
  video: { assetId: string | null; fileName: string | null; overlay: ColorRef; blur: number }
}

export type LogoSlotKey = 'primary' | 'reversed' | 'icon'

export type LogoSlot =
  | { kind: 'svg'; svg: string; name: string }
  | { kind: 'asset'; assetId: string; name: string; mime: string }

export interface LogoSet {
  id: string
  name: string
  builtin: boolean
  slots: Record<LogoSlotKey, LogoSlot | null>
  /** Display height (px) on the site; missing = LOGO_HEIGHTS default. */
  heights?: Partial<Record<LogoSlotKey, number>>
  /** Browser tab title; empty/missing = DEFAULT_TAB_TITLE. */
  tabTitle?: string
}

export interface Slices {
  palettes: Palette[]
  typography: TypographySet[]
  backgrounds: Background[]
  logos: LogoSet[]
  menus: MenuSet[]
  events: EventBook[]
  /** One item: the content of every page (Admin › Page Config). */
  pages: PageConfig[]
}

export type SliceKey = keyof Slices

export interface Applied {
  palette: string
  typography: string
  background: string
  logos: string
  menu: string
  events: string
  pages: string
}

export interface SavedState extends Slices {
  version: 1
  applied: Applied
  profile?: Profile
}

/** The user's personal details. Countries are ISO codes; dob is yyyy-MM-dd. */
export interface Profile {
  photo: { assetId: string; mime: string } | null
  prefix: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  phoneCountry: string
  phone: string
  street: string
  apartment: string
  suburb: string
  state: string
  postcode: string
  country: string
  dob: string
  sex: string
  /** ISO country code, '' = not given. */
  citizenship: string
  occupation: string
  clubs: string
  /** FIDE ID and Australian Chess Federation ID, digits only. */
  fideId: string
  acfId: string
  /** FIDE ratings by time control, digits only ('' = unrated). */
  fideStandard?: string
  fideRapid?: string
  fideBlitz?: string
  /** ACF rating, digits only ('' = unrated). */
  acfRating?: string
  /** Chess federation code, e.g. AUS ('' = from citizenship). */
  federation?: string
  /** FIDE K-factor: 10, 20 or 40. */
  kFide?: string
  /** Chess title, e.g. IM, WFM ('' = none). */
  title?: string
  /** Membership dates, yyyy-MM-dd ('' = not a member / never renewed). renewDate is the last renewal. */
  joinDate: string
  renewDate: string
  /** Every join and renewal, oldest first. */
  membershipHistory?: { kind: 'join' | 'renew'; date: string }[]
  /** Set by the server after the first full save: fields switched off in Page Config then turn view-only. */
  completed?: boolean
}

export type BrandTab = 'palette' | 'logos' | 'typography' | 'components'

export type PageId = 'home' | 'contact' | 'brand' | 'menu' | 'pages' | 'documents' | 'players' | 'events' | 'byes' | 'profile' | 'users' | 'approvals' | 'enquiries'
export type MenuTab = 'sidebar' | 'topbar' | 'footer'
/** On light / on dark version of the top bar or footer. */
export type BarVersion = 'light' | 'dark'

/** How the sub-tab window opens. */
export type SubOpen = 'hover' | 'click'
/** hover = cursor landing, fixed = always expanded, icons = icon only. */
export type SidebarMode = 'hover' | 'fixed' | 'icons'

/** Text + spacing of one menu element. null = same as the linked text style. */
export interface MenuText {
  style: string
  font: string | null
  size: number | null
  weight: number | null
  uppercase: boolean | null
  gap: number
  padX: number
  padY: number
}

/** Text rows, colours and sizes of one menu area (or one version of it). Colour null = linked to Components › Sidebar. */
export interface MenuLook {
  rows: Record<string, MenuText>
  colors: Record<string, ColorRef | null>
  layout: Record<string, number>
}

export type SocialPlatform = 'x' | 'instagram' | 'linkedin' | 'facebook' | 'youtube' | 'github'

export type FooterCell =
  | { kind: 'empty' }
  | { kind: 'page'; page: PageId }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string; url: string }
  | { kind: 'logo' }
  | { kind: 'copyright'; text: string }
  | { kind: 'social' }

export interface FooterColumn {
  id: string
  cells: FooterCell[]
}

export interface MenuSet {
  id: string
  name: string
  builtin: boolean
  /** enabled: undefined (older saves) counts as on. */
  sidebar: { enabled?: boolean; subOpen: SubOpen; mode: SidebarMode; look: MenuLook }
  topbar: { enabled: boolean; reversed: boolean; light: MenuLook; dark: MenuLook }
  footer: {
    enabled: boolean
    reversed: boolean
    columns: FooterColumn[]
    socials: { platform: SocialPlatform; url: string; on: boolean }[]
    light: MenuLook
    dark: MenuLook
  }
}

export interface EventCategory {
  id: string
  name: string
  color: ColorRef
}

/** Dates are yyyy-MM-dd, times HH:mm (24h, shown as 12h). */
export interface CalEvent {
  id: string
  name: string
  startDate: string
  endDate: string
  allDay: boolean
  startTime: string
  endTime: string
  location: string
  description: string
  category: string
  /** "On selected day": recurring on these weekdays (0 = Sunday … 6 = Saturday) between the start and end dates. */
  weekdays?: number[]
  /** Only members whose membership is valid on the start date can enter. */
  memberOnly?: boolean
  /** Only Australian and New Zealand citizens can enter. */
  citizensOnly?: boolean
  /** Set by the server: pending / rejected events wait in Review and approval. */
  status?: 'approved' | 'pending' | 'rejected'
  /** Set by the server: the user id that created it (TOs edit their own). */
  createdBy?: number | null
  /** Set by the server: arbiter user ids assigned to run its pairings. */
  arbiters?: number[]
  /** Set by the server: an edit is waiting for an admin (the live version is shown). */
  pendingChange?: boolean
  /** Full details page (required sections for tournaments). */
  details?: EventDetailsData
  /** People entered through this site. */
  entries?: EventEntry[]
  /** Final standings uploaded by the organiser (Vega / Swiss-Manager export). */
  results?: EventResults
  /** Round pairings, uploaded or generated, one per round. */
  pairings?: PairingRound[]
  /** Requested / organiser-set byes. A player with a bye in a round isn't paired in it. */
  byes?: EventBye[]
  /** Start numbers (entry id -> number), fixed when round 1 is generated. */
  startNumbers?: Record<string, number>
}

export interface EventBye {
  id: string
  entryId: string
  round: number
  /** Who set it: the player (from the tournament page) or the organiser (Byes page). */
  by: 'player' | 'organiser'
  /** ISO time set. */
  at: string
  /** Value the organiser chose on the Byes page (½ still needs the half-point rules to allow it). */
  value?: 0 | 0.5
  /** Handled on the Byes page: the player's row reads Updated once all their byes are. */
  done?: boolean
}

export interface PairingSide {
  /** The entry on this site (generated rounds). */
  entryId?: string
  /** Starting number. */
  sno: string
  title: string
  name: string
  /** FIDE federation code, e.g. AUS. */
  fed: string
  pts: string
}

export interface PairingBoard {
  board: number
  white: PairingSide
  /** null = bye. */
  black: PairingSide | null
  /** As shown, e.g. "1 - 0", "½ - ½", "" when not played yet. */
  result: string
  /** Generated byes: pairing-allocated (odd number), half-point or zero-point requested bye. */
  byeKind?: 'pab' | 'half' | 'zero'
}

export interface PairingRound {
  round: number
  /** Heading from the file, e.g. "Pairing of round 9, at 1430 of 29/09/2026". */
  title: string
  fileName: string
  /** ISO time uploaded. */
  at: string
  boards: PairingBoard[]
  /** Made by Generate pairing (Gacrux) rather than uploaded. */
  generated?: boolean
}

export interface ResultRow {
  place: number
  name: string
  /** null when the file had no points column. */
  points: number | null
  rating: string
  fideId: string
  acfId: string
  /** The entry on this site it matched, if any. */
  entryId?: string
}

export interface EventResults {
  fileName: string
  /** ISO time uploaded. */
  at: string
  rows: ResultRow[]
}

export type TimeType = 'standard' | 'rapid' | 'blitz'

export interface EventDetailsData {
  schedule: { id: string; round: string; date: string; time: string }[]
  /** room and note are optional (note: formatted text, e.g. parking). */
  venue: { name: string; room?: string; address: string; mapUrl: string; note?: string }
  contact: { name: string; email: string; phone: string }
  eventDetails: string
  fees: { id: string; type: string; amount: string; note: string }[]
  /** Optional formatted note under the fees, e.g. how to pay. */
  feesNote?: string
  regulations: string
  timeControl: string
  /** Time control ticks; at least one is required for a tournament. */
  timeTypes?: TimeType[]
  divisions: { id: string; name: string; ratingRange: string }[]
  byeRules: string
  forfeitRules: string
  playerRules: string
  spectatorRules: string
  prizes: string
  terms: string
  /** yyyy-MM-ddTHH:mm; '' = at the start of the event. */
  entriesClose: string
  /** Players register on this site instead of here. */
  registrationUrl: string
  /** Bye rules tickbox: requested byes are worth ½ point (max two per player). */
  halfPointByes?: boolean
}

/** A player kept in Admin › All players. Tournament entries link to it by playerId. */
export interface Player {
  id: string
  lastName: string
  firstName: string
  /** yyyy-MM-dd or ''. */
  dob: string
  gender: string
  fed: string
  title: string
  fideId: string
  kFide: string
  fideStandard: string
  fideRapid: string
  fideBlitz: string
  acfId: string
  acfRating: string
  email: string
  /** ISO time added. */
  added: string
}

export interface EventEntry {
  id: string
  /** The All players record this entry belongs to. */
  playerId?: string
  name: string
  email: string
  fideId: string
  acfId: string
  /** Copied from the profile when entering. */
  /** FIDE ratings by time control, digits only ('' = unrated). */
  fideStandard?: string
  fideRapid?: string
  fideBlitz?: string
  acfRating?: string
  /** Federation code, e.g. AUS. */
  fed?: string
  /** From the players template (organiser-added players). */
  dob?: string
  gender?: string
  /** Chess title, e.g. IM, WFM. */
  title?: string
  /** FIDE K-factor (10, 20 or 40). */
  kFide?: string
  /** How the entry was made. Missing on older entries (see sourceOf). */
  source?: 'signup' | 'import' | 'manual'
  /** Division id, '' when the event has none. */
  division: string
  /** ISO time entered. */
  at: string
}

/** The site's one shared event list (a slice of one item so it gets Save / Discard / Reset). */
export interface EventBook {
  id: string
  name: string
  builtin: boolean
  events: CalEvent[]
  categories: EventCategory[]
  /** Admin › All players. Missing (older saves) = built from the entries on first use. */
  players?: Player[]
  /** Calendar view settings; missing (older saves) = defaultCalView(). */
  view?: CalViewSettings
}

export type CalMode = 'week' | 'fortnight' | 'month'

export interface CalViewSettings {
  /** px height of a day cell in each mode. */
  cellHeight: Record<CalMode, number>
  /** One week as a time grid. */
  byDay: boolean
  /** Hours shown in the time grid, 0–24. */
  startHour: number
  endHour: number
  hourHeight: number
}

// ---------- Page Config ----------

/** auto = worked out from the image's brightness and overlay. */
export type Tone = 'auto' | 'dark' | 'light'

/** An uploaded background image. */
export interface PageImage {
  assetId: string | null
  fileName: string | null
  /** Black overlay strength, 0–100. */
  overlay: number
  tone: Tone
  /** Measured on upload, 0 (black) – 1 (white). */
  luminance: number | null
}

export type PageLink = { kind: 'none' } | { kind: 'page'; page: PageId } | { kind: 'url'; url: string }

export interface PageButton {
  id: string
  label: string
  link: PageLink
}

/** Title band of a page. Empty title / intro / label = the app's own wording. */
export interface PageHeadConfig {
  menuLabel: string
  title: string
  intro: string
  image: PageImage
  /** Minimum height, percent of the window. 0 = fit the content. */
  height: number
}

export interface GalleryItem {
  id: string
  title: string
  text: string
  assetId: string | null
  fileName: string | null
  button: PageButton
}

export interface EmphasisItem {
  id: string
  title: string
  text: string
}

export interface ProjectItem extends GalleryItem {
  /** Small line above the title, e.g. PROJECT 01. */
  label: string
}

export interface HomeConfig {
  hero: { enabled: boolean; title: string; text: string; image: PageImage; /** Percent of the window height. */ height: number; buttons: PageButton[] }
  gallery: { enabled: boolean; title: string; text: string; /** Like PageHeadConfig.height. */ height: number; items: GalleryItem[] }
  emphasis: { enabled: boolean; title: string; image: PageImage; height: number; items: EmphasisItem[]; button: PageButton }
  projects: {
    enabled: boolean
    title: string
    height: number
    /** px the sliding panel stops from the image's left edge. */
    inset: number
    /** px around the text inside the panel. */
    padding: number
    items: ProjectItem[]
  }
}

export interface ContactConfig {
  title: string
  text: string
  height: number
  /** Address, email, phone: one per line. */
  details: string
  links: PageButton[]
  inquiryTypes: string[]
  /** Shown after sending. */
  thanks: string
  /** Staff address enquiries go to ('' = none). Only sent to people who can edit Page Config. */
  notifyEmail: string
  /** Emailed to the sender. Only sent to people who can edit Page Config. */
  autoReply: string
}

export interface PageConfig {
  id: string
  name: string
  builtin: boolean
  heads: Record<PageId, PageHeadConfig>
  home: HomeConfig
  contact: ContactConfig
  /** Profile field -> members can change it after their first save. */
  profileFields: Record<string, boolean>
  /** Calendar sizes; missing = the older calendar view settings. */
  calendar: { cellHeight?: Record<CalMode, number>; hourHeight?: number }
}
