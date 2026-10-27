// Uploaded files (images, videos, logos) live in IndexedDB; localStorage only keeps their ids.

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

export const putAsset = (a: StoredAsset) => tx('readwrite', (s) => s.put(a))
export const getAsset = (id: string) => tx<StoredAsset | undefined>('readonly', (s) => s.get(id))
export const deleteAsset = (id: string) => tx('readwrite', (s) => s.delete(id))
export const listAssetIds = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys())

const urlCache = new Map<string, Promise<string | null>>()

export function assetUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id)
  if (!p) {
    p = getAsset(id)
      .then((a) => (a ? URL.createObjectURL(a.blob) : null))
      .catch(() => null)
    urlCache.set(id, p)
  }
  return p
}

/** Remove files no saved item points at any more. */
export async function collectGarbage(referenced: Set<string>) {
  try {
    const ids = await listAssetIds()
    await Promise.all(ids.filter((id) => !referenced.has(String(id))).map((id) => deleteAsset(String(id))))
  } catch {
    // IndexedDB unavailable (private mode etc.) – nothing to clean.
  }
}
