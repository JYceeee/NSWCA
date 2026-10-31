// The site's own starting settings, saved from Page Config › Save as site defaults (siteDefaults.json is generated).
// A browser or database with nothing saved yet starts from these instead of the app's built-ins.
import raw from './siteDefaults.json'
import type { Applied, EventBook, Slices } from '../types'

export type SiteDefaults = Partial<Omit<Slices, 'events'>> & {
  applied?: Applied
  /** The calendar's categories and view; events and players are club data, not settings. */
  calendar?: Pick<EventBook, 'categories' | 'view'>
  /** Upload id -> file in public/. */
  assets?: Record<string, string>
}

export const SITE_DEFAULTS = raw as unknown as SiteDefaults

/** Where a default image is served from. */
export const defaultAssetUrl = (id: string) => {
  const file = SITE_DEFAULTS.assets?.[id]
  return file ? `${import.meta.env.BASE_URL}${file}` : null
}
