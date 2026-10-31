import { useRef, useState } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { detailsOf } from '../data/eventDetails'
import type { CalEvent, PairingBoard, PairingRound, PairingSide } from '../types'
import { downloadPairingTemplate, isFinished, readPairings, type ParsedRound } from './pairings'
import { nameKey } from './results'

/**
 * Pairings (rounds still to finish, with upload) or Results (finished rounds) – the same table, one file per round.
 * A round moves to Results once every game has a result.
 */
export function PairingsSection({
  event, you, setEvent, mode, canEdit,
}: {
  event: CalEvent
  you: string
  setEvent: (fn: (e: CalEvent) => CalEvent) => void
  mode: 'pairings' | 'results'
  /** Upload and remove rounds (organiser / assigned arbiter). */
  canEdit: boolean
}) {
  const results = mode === 'results'
  const { confirm, toast } = useDialogs()
  const input = useRef<HTMLInputElement>(null)
  const all = [...(event.pairings ?? [])].sort((a, b) => a.round - b.round)
  const rounds = all.filter((r) => isFinished(r) === results)
  const scheduled = detailsOf(event).schedule.filter((r) => r.date).length
  const count = Math.max(scheduled, all[all.length - 1]?.round ?? 0)
  const [shown, setShown] = useState<number | null>(rounds[rounds.length - 1]?.round ?? null)
  const current = rounds.find((r) => r.round === shown) ?? rounds[rounds.length - 1]
  const [preview, setPreview] = useState<(ParsedRound & { fileName: string; roundNo: number }) | null>(null)
  const [busy, setBusy] = useState(false)

  // Your name on a board, from your entry on this site.
  const mine = you && event.entries?.find((e) => e.email.toLowerCase() === you.toLowerCase())
  const isYou = (s: PairingSide | null) => !!(mine && s && nameKey(s.name) === nameKey(mine.name))

  const load = async (f: File) => {
    setBusy(true)
    try {
      const parsed = await readPairings(f)
      setPreview({ ...parsed, fileName: f.name, roundNo: parsed.round ?? (all[all.length - 1]?.round ?? 0) + 1 })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'This file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    if (!preview) return
    const round: PairingRound = {
      round: preview.roundNo,
      title: preview.title,
      fileName: preview.fileName,
      at: new Date().toISOString(),
      boards: preview.boards,
    }
    setEvent((e) => ({ ...e, pairings: [...(e.pairings ?? []).filter((r) => r.round !== round.round), round] }))
    setShown(round.round)
    setPreview(null)
    toast(`Round ${round.round} pairings saved`)
  }

  const remove = async (r: PairingRound) => {
    if (!(await confirm({ title: `Remove round ${r.round} pairings?`, message: 'You can upload them again later.', confirmLabel: 'Remove', danger: true }))) return
    setEvent((e) => ({ ...e, pairings: (e.pairings ?? []).filter((x) => x.round !== r.round) }))
    setShown(null)
  }

  const replacing = preview && all.some((r) => r.round === preview.roundNo)
  const id = results ? 'results' : 'pairings'
  const heading = (r: PairingRound) =>
    results ? (r.title ? r.title.replace(/^pairings?\s+(of|for)/i, 'Results of') : `Results of round ${r.round}`) : r.title || `Pairing of round ${r.round}`

  return (
    <section id={`ed-${id}`} className="ed-section">
      <div className="ed-section-head">
        <h2>{results ? 'Results' : 'Pairings'}</h2>
        {!results && canEdit && (
        <div className="ed-section-actions">
          <button className="ui-btn ui-btn--small" onClick={() => downloadPairingTemplate().catch(() => toast('Could not create the template'))}>
            <Icon name="download" size={14} /> Download template
          </button>
          <button className="ui-btn ui-btn--small" disabled={busy} onClick={() => input.current?.click()}>
            <Icon name="upload" size={14} /> Upload round
          </button>
          {current && (
            <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => remove(current)}>
              <Icon name="trash" size={14} /> Remove round {current.round}
            </button>
          )}
        </div>
        )}
        {results && current && canEdit && (
          <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => remove(current)}>
            <Icon name="trash" size={14} /> Remove round {current.round}
          </button>
        )}
        <input
          ref={input}
          type="file"
          hidden
          accept=".csv,.xlsx"
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
            <h3>{heading(current)}</h3>
            <div className="pr-rounds" role="tablist" aria-label="Round">
              {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                const has = rounds.some((r) => r.round === n)
                return (
                  <button
                    key={n}
                    role="tab"
                    aria-selected={current.round === n}
                    disabled={!has}
                    title={has ? `Round ${n}` : all.some((r) => r.round === n) ? (results ? `Round ${n} – not finished yet` : `Round ${n} – finished, see Results`) : `Round ${n} – not uploaded yet`}
                    className={current.round === n ? 'pr-round pr-round--on' : 'pr-round'}
                    onClick={() => setShown(n)}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          <PairingTable boards={current.boards} isYou={isYou} />
        </>
      ) : (
        <p className="muted">
          {results
            ? 'No finished rounds yet. A round appears here once its file in Pairings has every result filled in.'
            : all.length
              ? 'All uploaded rounds are finished – see Results. Upload the next round’s pairings here.'
              : 'No pairings yet. Upload each round’s pairings exported from Vega or Swiss-Manager (.csv or .xlsx). Upload it again with the results to move it to Results.'}
        </p>
      )}

      {preview && (
        <Modal title="Upload pairings" onClose={() => setPreview(null)} width={980}>
          <div className="modal-body">
            <div className="pr-preview-head">
              <label className="form-row">
                <span>Round</span>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  max={99}
                  value={preview.roundNo}
                  onChange={(e) => setPreview({ ...preview, roundNo: Math.max(1, Number(e.target.value) || 1) })}
                  style={{ width: 90 }}
                />
              </label>
              <span className="muted small">
                {preview.boards.length} boards from {preview.fileName}
                {preview.title && ` · “${preview.title}”`}
                {replacing && ` · replaces the round ${preview.roundNo} already uploaded`}
              </span>
            </div>
            <PairingTable boards={preview.boards} isYou={isYou} />
          </div>
          <div className="modal-actions">
            <button className="ui-btn" onClick={() => setPreview(null)}>Cancel</button>
            <button className="ui-btn ui-btn--primary" onClick={save}>
              {replacing ? `Replace round ${preview.roundNo}` : `Save round ${preview.roundNo}`}
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
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
