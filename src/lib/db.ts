// Uploaded files (images, videos, logos, photos). They go to the server (api › upload) and are served from there;
// IndexedDB keeps a copy in this browser so they show at once and offline. Saved items only keep their ids.
import { defaultAssetUrl } from '../data/siteDefaults'
import { apiUpload, fileUrl, LOCAL_ONLY } from './api'

const DB_NAME = 'principles-assets'
const STORE = 'assets'

export interface StoredAsset {
  id: string
  name: string
  type: string
  blob: Blob
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

const putLocal = (a: StoredAsset) => tx('readwrite', (s) => s.put(a))
const getLocal = (id: string) => tx<StoredAsset | undefined>('readonly', (s) => s.get(id))

/** Uploads the file (photo = private profile photo; brand = logos and backgrounds, public) and keeps a local copy. */
export async function putAsset(a: StoredAsset, kind: 'brand' | 'photo' = 'brand') {
  if (!LOCAL_ONLY) await apiUpload('upload', { id: a.id, kind, file: a.blob }, a.name)
  await putLocal(a).catch(() => {
    // IndexedDB unavailable (private mode etc.): the server copy is enough.
    if (LOCAL_ONLY) throw new Error('Could not store the file in this browser')
  })
}

/** The local copy, or the server's (fetched). */
export async function getAsset(id: string): Promise<StoredAsset | undefined> {
  const local = await getLocal(id).catch(() => undefined)
  const bundled = defaultAssetUrl(id)
  if (local || (LOCAL_ONLY && !bundled)) return local
  const r = await fetch(bundled ?? fileUrl(id), { credentials: 'same-origin' })
  if (!r.ok) return undefined
  const blob = await r.blob()
  return { id, name: id, type: blob.type, blob }
}

export const deleteAsset = (id: string) => tx('readwrite', (s) => s.delete(id))
export const listAssetIds = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())

/** Every file in this browser (for Import into MySQL). */
export const listLocalAssets = () => tx<StoredAsset[]>('readonly', (s) => s.getAll() as IDBRequest<StoredAsset[]>)

const urlCache = new Map<string, Promise<string | null>>()

export function assetUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id)
  if (!p) {
    const remote = defaultAssetUrl(id) ?? (LOCAL_ONLY ? null : fileUrl(id))
    p = getLocal(id)
      .then((a) => (a ? URL.createObjectURL(a.blob) : remote))
      .catch(() => remote)
    urlCache.set(id, p)
  }
  return p
}

/** Remove files no saved item points at any more (this browser's copies only). */
export async function collectGarbage(referenced: Set<string>) {
  try {
    const ids = await listAssetIds()
    await Promise.all(ids.filter((id) => !referenced.has(String(id))).map((id) => deleteAsset(String(id))))
  } catch {
    // IndexedDB unavailable (private mode etc.) – nothing to clean.
  }
}
