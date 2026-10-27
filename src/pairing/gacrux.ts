// Main-thread side of the Gacrux worker.
import type { PairRequest } from './gacrux.worker'

let worker: Worker | null = null
let next = 0

export interface GacruxResult {
  pairs: [number, number][]
  rules: string
}

/** Pairs one round with Gacrux. The first call downloads Python (~10 MB, cached by the browser afterwards). */
export function gacruxPair(req: Omit<PairRequest, 'id' | 'wheelUrl'>, onProgress?: (msg: string) => void): Promise<GacruxResult> {
  worker ??= new Worker(new URL('./gacrux.worker.ts', import.meta.url), { type: 'module' })
  const id = ++next
  const wheelUrl = new URL('py/gacrux-1.11.65-py3-none-any.whl', document.baseURI).href
  return new Promise((resolve, reject) => {
    const w = worker!
    const handle = (ev: MessageEvent) => {
      const m = ev.data
      if (m.id !== id) return
      if (m.progress) return onProgress?.(m.progress)
      w.removeEventListener('message', handle)
      if (m.error) return reject(new Error(`Gacrux couldn’t run: ${m.error}`))
      try {
        const out = JSON.parse(m.json)
        const code = out.status?.code ?? 0
        if (code >= 400 || !out.pairingResult) {
          const why = [...(out.status?.error ?? []), ...(out.status?.info ?? [])].join(' ')
          return reject(new Error(code === 505 || code === 504 ? `No legal pairing exists for this round. ${why}` : `Gacrux reported a problem (${code}). ${why}`))
        }
        resolve({ pairs: out.pairingResult.pairs, rules: out.pairingResult.rules })
      } catch {
        reject(new Error('Gacrux returned an unreadable answer'))
      }
    }
    w.addEventListener('message', handle)
    w.postMessage({ ...req, id, wheelUrl } satisfies PairRequest)
  })
}
