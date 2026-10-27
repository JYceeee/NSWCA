/// <reference lib="webworker" />
// Runs Gacrux (FIDE Dutch pairing, Python) with Pyodide off the main thread.

const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'

const RUNNER = `
import sys, json
from gacrux.pairingchecker import pairingchecker

def gx_pair(trf, rnd, top, unpaired, pab):
    src, out = '/tmp/gx_in.trf', '/tmp/gx_out.json'
    open(src, 'w', encoding='utf-8').write(trf)
    argv = ['pairingchecker', '-i', src, '-o', out, '-b', 'utf-8', '-p', '-n', str(rnd)]
    if top:
        argv += ['-t', top]
    if unpaired:
        argv += ['-u'] + [str(u) for u in unpaired]
    sys.argv = argv
    p = pairingchecker()
    p.do_command(p.read_command_line, 500, 'Bad command line')
    p.do_command(p.read_input_file, 502, 'Error reading the tournament')
    # Gacrux 1.11's -G option fails for TRF input, so the bye value is set on the loaded tournament.
    for t in p.chessfile.chessjson['event'].get('tournaments', []):
        t['scoreSystem']['game']['P'] = pab
    p.do_command(p.prepare_tournament, 501, 'Invalid tournament')
    p.do_command(p.do_checker, 481, 'Pairing failed')
    p.do_command(p.apply_result, 482, 'Pairing failed')
    p.do_command(p.write_output_file, 503, 'Error writing result')
    return open(out, encoding='utf-8').read()
`

export interface PairRequest {
  id: number
  wheelUrl: string
  trf: string
  round: number
  top: 'w' | 'b' | null
  unpaired: number[]
  pab: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ready: Promise<any> | null = null

function load(wheelUrl: string) {
  ready ??= (async () => {
    const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`)
    const py = await loadPyodide({ indexURL: PYODIDE })
    await py.loadPackage(['micropip', 'networkx'])
    const micropip = py.pyimport('micropip')
    await micropip.install(wheelUrl, { deps: false })
    py.runPython(RUNNER)
    return py
  })()
  return ready
}

self.onmessage = async (ev: MessageEvent<PairRequest>) => {
  const r = ev.data
  try {
    postMessage({ id: r.id, progress: 'Loading the Gacrux pairing engine…' })
    const py = await load(r.wheelUrl)
    postMessage({ id: r.id, progress: 'Pairing…' })
    const pair = py.globals.get('gx_pair')
    const json = pair(r.trf, r.round, r.top, py.toPy(r.unpaired), r.pab)
    postMessage({ id: r.id, json })
  } catch (e) {
    ready = null
    postMessage({ id: r.id, error: e instanceof Error ? e.message : String(e) })
  }
}
