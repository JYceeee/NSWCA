import type { SiteDefaults } from '../data/siteDefaults'
import type { SavedState } from '../types'
import { getAsset } from './db'

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** Writes the saved settings and their files into the project (dev server only). Returns how many files went. */
export async function saveSiteDefaults(s: SavedState, ids: Iterable<string>): Promise<number> {
  const { palettes, typography, backgrounds, logos, menus, pages, applied } = s
  const { categories, view } = s.events[0]
  const state: SiteDefaults = { palettes, typography, backgrounds, logos, menus, pages, applied, calendar: { categories, view } }
  const assets = []
  for (const id of ids) {
    const a = await getAsset(id)
    if (!a) throw new Error(`A file used by the site couldn’t be read (${id}). Upload it again.`)
    const ext = a.name.includes('.') ? a.name.slice(a.name.lastIndexOf('.')) : `.${a.type.split('/')[1] ?? 'bin'}`
    assets.push({ id, name: `${id}${ext}`, data: await base64(a.blob) })
  }
  const r = await fetch('/__site-defaults', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, assets }) })
  if (!r.ok) throw new Error('The dev server couldn’t write the defaults.')
  return assets.length
}
