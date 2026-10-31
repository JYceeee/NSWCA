// The PHP API on the web server (public/api), which keeps everything in MySQL.

/**
 * VITE_LOCAL_ONLY=1 runs the app as before: no server, everything in this browser, full access.
 * Handy for brand / menu design work with `npm run dev` when no API is reachable.
 */
export const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === '1'

const BASE = `${import.meta.env.BASE_URL}api/`

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function parse<T>(r: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await r.json()
  } catch {
    // Not JSON: a proxy error page, PHP not running…
  }
  if (!r.ok) {
    const msg = (body as { error?: string } | null)?.error ?? (r.status === 404 ? 'The server’s API wasn’t found.' : `The server answered ${r.status}.`)
    throw new ApiError(r.status, msg)
  }
  return body as T
}

export async function apiGet<T>(action: string): Promise<T> {
  const r = await fetch(`${BASE}?a=${action}`, { credentials: 'same-origin', cache: 'no-store' })
  return parse<T>(r)
}

export async function apiPost<T>(action: string, body: unknown = {}): Promise<T> {
  const r = await fetch(`${BASE}?a=${action}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Principles': '1' },
    body: JSON.stringify(body),
  })
  return parse<T>(r)
}

/** Multipart upload (files plus text fields). */
export async function apiUpload<T>(action: string, fields: Record<string, string | Blob>, fileName?: string): Promise<T> {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string') fd.append(k, v)
    else fd.append(k, v, fileName ?? (v instanceof File ? v.name : 'file'))
  }
  const r = await fetch(`${BASE}?a=${action}`, { method: 'POST', credentials: 'same-origin', headers: { 'X-Principles': '1' }, body: fd })
  return parse<T>(r)
}

/** Where an uploaded file (logo, background, photo, document) is served from. */
export const fileUrl = (id: string) => `${BASE}?a=file&id=${encodeURIComponent(id)}`
