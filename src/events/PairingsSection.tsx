import { useRef, useState } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { detailsOf } from '../data/eventDetails'
import type { CalEvent, PairingBoard, PairingRound, PairingSide } from '../types'
import { readPairings, readTrf, type ParsedRound } from './pairings'
import { nameKey } from './results'

type Preview = { fileName: string; rounds: (ParsedRound & { round: number })[]; startNumbers: Record<string, number>; unmatched: string[]; trf: boolean }

/** The tournament's pairings: a TRF file with every round, or one round's .csv / .xlsx from Vega or Swiss-Manager. */
export function PairingsSection({
  event, you, setEvent, canEdit,
}: {
  event: CalEvent
  you: string
  setEvent: (fn: (e: CalEvent) => CalEvent) => void
  /** Import and remove rounds (organiser / assigned arbiter). */
  canEdit: boolean
}) {
  const { confirm, toast } = useDialogs()
  const input = useRef<HTMLInputElement>(null)
  const all = [...(event.pairings ?? [])].sort((a, b) => a.round - b.round)
  const scheduled = detailsOf(event).schedule.filter((r) => r.date).length
  const count = Math.max(scheduled, all[all.length - 1]?.round ?? 0)
  const [shown, setShown] = useState<number | null>(all[all.length - 1]?.round ?? null)
  const current = all.find((r) => r.round === shown) ?? all[all.length - 1]
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewRound, setPreviewRound] = useState(0)
  const [busy, setBusy] = useState(false)

  // Your name on a board, from your entry on this site.
  const mine = you && event.entries?.find((e) => e.email.toLowerCase() === you.toLowerCase())
  const isYou = (s: PairingSide | null) => !!(mine && s && nameKey(s.name) === nameKey(mine.name))

  const load = async (f: File) => {
    setBusy(true)
    try {
      if (/\.(xlsx|csv)$/i.test(f.name)) {
        const parsed = await readPairings(f)
        setPreview({ fileName: f.name, rounds: [{ ...parsed, round: parsed.round ?? (all[all.length - 1]?.round ?? 0) + 1 }], startNumbers: {}, unmatched: [], trf: false })
      } else {
        const trf = readTrf(await trfText(f), event.entries ?? [])
        setPreview({ fileName: f.name, trf: true, ...trf })
        setPreviewRound(trf.rounds[trf.rounds.length - 1].round)
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'This file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!preview) return
    const at = new Date().toISOString()
    const next: PairingRound[] = preview.rounds.map((r) => ({ round: r.round, title: r.title, fileName: preview.fileName, at, boards: r.boards }))
    const numbers = new Set(next.map((r) => r.round))
    setEvent((e) => ({
      ...e,
      startNumbers: { ...e.startNumbers, ...preview.startNumbers },
      pairings: [...(e.pairings ?? []).filter((r) => !numbers.has(r.round)), ...next],
    }))
    setShown(next[next.length - 1].round)
    setPreview(null)
    toast(next.length === 1 ? `Round ${next[0].round} pairings saved` : `${next.length} rounds of pairings saved`)
  }

  const remove = async (r: PairingRound) => {
    if (!(await confirm({ title: `Remove round ${r.round} pairings?`, message: 'You can import them again later.', confirmLabel: 'Remove', danger: true }))) return
    setEvent((e) => ({ ...e, pairings: (e.pairings ?? []).filter((x) => x.round !== r.round) }))
    setShown(null)
  }

  const replacing = preview?.rounds.filter((p) => all.some((r) => r.round === p.round)).length ?? 0
  const shownInPreview = preview?.rounds.find((r) => r.round === previewRound) ?? preview?.rounds[0]

  return (
    <section id="ed-pairings" className="ed-section">
      <div className="ed-section-head">
        <h2>Pairings</h2>
        {canEdit && (
          <div className="ed-section-actions">
            <button className="ui-btn ui-btn--small" disabled={busy} onClick={() => input.current?.click()}>
              <Icon name="upload" size={14} /> Import TRF
            </button>
            {current && (
              <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => remove(current)}>
                <Icon name="trash" size={14} /> Remove round {current.round}
              </button>
            )}
          </div>
        )}
        <input
          ref={input}
          type="file"
          hidden
          accept=".trf,.txt,.csv,.xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) load(f)
            e.target.value = ''
          }}
        />
      </div>

      {current ? (
        <>
          <div className="pr-head">
            <h3>{current.title || `Pairing of round ${current.round}`}</h3>
            <div className="pr-rounds" role="tablist" aria-label="Round">
              {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                const has = all.some((r) => r.round === n)
                return (
                  <button key={n} role="tab" aria-selected={current.round === n} disabled={!has} title={has ? `Round ${n}` : `Round ${n} – not imported yet`} className={current.round === n ? 'pr-round pr-round--on' : 'pr-round'} onClick={() => setShown(n)}>
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          <PairingTable boards={current.boards} isYou={isYou} />
        </>
      ) : (
        <p className="muted">No pairings yet. Import the TRF file exported from Vega or Swiss-Manager (.csv and .xlsx round exports work too).</p>
      )}

      {preview && shownInPreview && (
        <Modal title="Import pairings" onClose={() => setPreview(null)} width={980}>
          <div className="modal-body">
            <div className="pr-preview-head">
              {preview.trf ? (
                <div className="pr-rounds" role="tablist" aria-label="Round">
                  {preview.rounds.map((r) => (
                    <button key={r.round} role="tab" aria-selected={r.round === shownInPreview.round} className={r.round === shownInPreview.round ? 'pr-round pr-round--on' : 'pr-round'} onClick={() => setPreviewRound(r.round)}>
                      {r.round}
                    </button>
                  ))}
                </div>
              ) : (
                <label className="form-row">
                  <span>Round</span>
                  <input
                    className="ui-input"
                    type="number"
                    min={1}
                    max={99}
                    value={shownInPreview.round}
                    onChange={(e) => setPreview({ ...preview, rounds: [{ ...shownInPreview, round: Math.max(1, Number(e.target.value) || 1) }] })}
                    style={{ width: 90 }}
                  />
                </label>
              )}
              <span className="muted small">
                {preview.rounds.length} {preview.rounds.length === 1 ? 'round' : 'rounds'} from {preview.fileName}
                {replacing > 0 && ` · replaces ${replacing} already here`}
              </span>
            </div>
            {preview.unmatched.length > 0 && (
              <p className="muted small">
                Not matched to an entry on this site, shown by name only: {preview.unmatched.slice(0, 8).join('; ')}
                {preview.unmatched.length > 8 && ` and ${preview.unmatched.length - 8} more`}.
              </p>
            )}
            <PairingTable boards={shownInPreview.boards} isYou={isYou} />
          </div>
          <div className="modal-actions">
            <button className="ui-btn" onClick={() => setPreview(null)}>Cancel</button>
            <button className="ui-btn ui-btn--primary" onClick={save}>
              {preview.rounds.length === 1 ? `Save round ${shownInPreview.round}` : `Save ${preview.rounds.length} rounds`}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}

/** TRF files are UTF-8 or, from older programs, Windows-1252. */
async function trfText(f: File) {
  const buf = await f.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(buf)
  return text.includes('�') ? new TextDecoder('windows-1252').decode(buf) : text
}

function Player({ s, color, you }: { s: PairingSide; color: 'white' | 'black'; you: boolean }) {
  return (
    <span className="pr-player">
      {s.sno && <span className={`pr-sno pr-sno--${color}`}>{s.sno}</span>}
      {s.title ? <span className={/^W/.test(s.title) ? 'pr-title pr-title--w' : 'pr-title'}>{s.title}</span> : <span className="pr-title pr-title--none" aria-hidden />}
      <span className="pr-name">
        {s.name}
        {you && <span className="pr-you">you</span>}
      </span>
    </span>
  )
}

const Fed = ({ code }: { code: string }) => (code ? <span className="pr-fed">{code}</span> : null)

export function PairingTable({ boards, isYou }: { boards: PairingBoard[]; isYou: (s: PairingSide | null) => boolean }) {
  return (
    <div className="pr-wrap">
      <table className="pr-table">
        <thead>
          <tr>
            <th>Bo.</th>
            <th>Fed</th>
            <th>White player</th>
            <th>Pts</th>
            <th className="pr-c">Result</th>
            <th>Pts</th>
            <th>Black player</th>
            <th>Fed</th>
          </tr>
        </thead>
        <tbody>
          {[...boards]
            .sort((a, b) => a.board - b.board)
            .map((b) => (
              <tr key={b.board} className={isYou(b.white) || isYou(b.black) ? 'pr-row-you' : undefined}>
                <td>{b.board}</td>
                <td>
                  <Fed code={b.white.fed} />
                </td>
                <td>
                  <Player s={b.white} color="white" you={isYou(b.white)} />
                </td>
                <td>{b.white.pts}</td>
                <td className="pr-c pr-result">{b.result || '–'}</td>
                {b.black ? (
                  <>
                    <td>{b.black.pts}</td>
                    <td>
                      <Player s={b.black} color="black" you={isYou(b.black)} />
                    </td>
                    <td>
                      <Fed code={b.black.fed} />
                    </td>
                  </>
                ) : (
                  <>
                    <td />
                    <td className="pr-bye">{b.byeKind === 'half' ? '( half-point bye )' : b.byeKind === 'zero' ? '( zero-point bye )' : '( bye )'}</td>
                    <td />
                  </>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
