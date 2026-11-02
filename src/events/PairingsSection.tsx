import { format } from 'date-fns'
import { useRef, useState, type ReactNode } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { TitlePill } from '../components/TitlePill'
import type { CalEvent, PairingBoard, PairingRound, PairingSide } from '../types'
import { scheduledRounds } from './byes'
import { readPairings, readTrf, type ParsedRound } from './pairings'
import { nameKey } from './results'
import { boardPoints, divisionsOf, roundsOf } from './standings'

const GAME_RESULTS = ['1 - 0', '½ - ½', '0 - 1', '+ - -', '- - +', '- - -']
const BYE_RESULTS = ['1', '½', '0']

type Preview = { file: File; division: string; rounds: (ParsedRound & { round: number })[]; startNumbers: Record<string, number>; unmatched: string[]; trf: boolean }

/** The same players on the same boards, so a release still stands after importing the round again. */
const samePlayers = (a: PairingBoard[], b: PairingBoard[]) =>
  a.length === b.length && a.every((x) => {
    const y = b.find((o) => o.board === x.board)
    return !!y && nameKey(x.white.name) === nameKey(y.white.name) && nameKey(x.black?.name ?? '') === nameKey(y.black?.name ?? '')
  })

/**
 * The tournament's pairings and results: a TRF file with every round, or one round's .csv / .xlsx from Vega or Swiss-Manager.
 * Those who enter results do it in the Result column, then release the round to the public.
 */
export function PairingsSection({
  event, you, setEvent, canEdit, canResults,
}: {
  event: CalEvent
  you: string
  setEvent: (fn: (e: CalEvent) => CalEvent) => void
  /** Import and remove rounds (organiser / assigned arbiter). */
  canEdit: boolean
  /** Enter and release results. */
  canResults: boolean
}) {
  const { confirm, toast } = useDialogs()
  const input = useRef<HTMLInputElement>(null)
  const divisions = divisionsOf(event)
  const [division, setDivision] = useState(divisions[0].id)
  const all = roundsOf(event, division)
  const scheduled = scheduledRounds(event, division).length
  const count = Math.max(scheduled, all[all.length - 1]?.round ?? 0)
  const [shown, setShown] = useState<number | null>(all[all.length - 1]?.round ?? null)
  const current = all.find((r) => r.round === shown) ?? all[all.length - 1]
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewRound, setPreviewRound] = useState(0)
  const [busy, setBusy] = useState(false)
  /** Board number → result changed here and not saved yet (current round). */
  const [edits, setEdits] = useState<Record<number, string>>({})

  const value = (b: PairingBoard) => edits[b.board] ?? b.result
  const dirty = !!current && current.boards.some((b) => value(b) !== b.result)
  const complete = !!current && current.boards.every((b) => boardPoints(b, value(b)))
  const unreleased = !!current && current.boards.some((b) => value(b) !== (b.releasedResult ?? ''))
  const locked = dirty ? 'Save or release your results first' : undefined

  const writeResults = (release: boolean) => {
    if (!current) return
    const resultsAt = new Date().toISOString()
    setEvent((e) => ({
      ...e,
      pairings: (e.pairings ?? []).map((r) =>
        r.round !== current.round || (r.division ?? '') !== division
          ? r
          : {
              ...r,
              ...(release ? { resultsAt } : {}),
              boards: r.boards.map((b) => {
                const result = edits[b.board] ?? b.result
                return { ...b, result, ...(release ? { releasedResult: result } : {}) }
              }),
            },
      ),
    }))
    setEdits({})
    toast(release ? `Round ${current.round} results released` : `Round ${current.round} results saved`)
  }

  const resultCell = (b: PairingBoard) => {
    const v = value(b)
    const options = b.black ? GAME_RESULTS : BYE_RESULTS
    return (
      <select className="pr-result-input" aria-label={`Result on board ${b.board}`} value={v} onChange={(e) => setEdits({ ...edits, [b.board]: e.target.value })}>
        <option value="">–</option>
        {[...options, ...(v && !options.includes(v) ? [v] : [])].map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    )
  }

  // Your name on a board, from your entry on this site.
  const mine = you && event.entries?.find((e) => e.email.toLowerCase() === you.toLowerCase())
  const isYou = (s: PairingSide | null) => !!(mine && s && nameKey(s.name) === nameKey(mine.name))

  const load = async (f: File, into: string) => {
    setBusy(true)
    try {
      if (/\.(xlsx|csv)$/i.test(f.name)) {
        const parsed = await readPairings(f)
        const last = roundsOf(event, into).pop()?.round ?? 0
        setPreview({ file: f, division: into, rounds: [{ ...parsed, round: parsed.round ?? last + 1 }], startNumbers: {}, unmatched: [], trf: false })
      } else {
        const entries = (event.entries ?? []).filter((x) => divisions.length === 1 || x.division === into)
        const trf = readTrf(await trfText(f), entries)
        setPreview({ file: f, division: into, trf: true, ...trf })
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
    const into = roundsOf(event, preview.division)
    const next: PairingRound[] = preview.rounds.map((r) => {
      const old = into.find((x) => x.round === r.round)
      // A round imported again keeps its release and anything entered here that the file doesn't have, unless the pairings changed.
      const kept = old && samePlayers(old.boards, r.boards) ? old : undefined
      const boards = r.boards.map((b) => {
        const was = kept?.boards.find((x) => x.board === b.board)
        return { ...b, result: b.result || was?.result || '', releasedResult: was?.releasedResult ?? '' }
      })
      return { division: preview.division, round: r.round, title: r.title, fileName: preview.file.name, at, resultsAt: kept?.resultsAt ?? '', boards }
    })
    const numbers = new Set(next.map((r) => r.round))
    setEvent((e) => ({
      ...e,
      startNumbers: { ...e.startNumbers, ...preview.startNumbers },
      pairings: [...(e.pairings ?? []).filter((r) => (r.division ?? '') !== preview.division || !numbers.has(r.round)), ...next],
    }))
    setDivision(preview.division)
    setShown(next[next.length - 1].round)
    setEdits({})
    setPreview(null)
    toast(next.length === 1 ? `Round ${next[0].round} pairings saved` : `${next.length} rounds of pairings saved`)
  }

  const remove = async (r: PairingRound) => {
    if (!(await confirm({ title: `Remove round ${r.round} pairings?`, message: r.resultsAt ? 'Its released results come off the Results page too. You can import the pairings again later.' : 'You can import them again later.', confirmLabel: 'Remove', danger: true }))) return
    setEvent((e) => ({ ...e, pairings: (e.pairings ?? []).filter((x) => (x.division ?? '') !== division || x.round !== r.round) }))
    setShown(null)
  }

  const previewInto = preview ? roundsOf(event, preview.division) : []
  const replacing = preview?.rounds.filter((p) => previewInto.some((r) => r.round === p.round)).length ?? 0
  const unreleasing = preview?.rounds.filter((p) => {
    const old = previewInto.find((r) => r.round === p.round)
    return old?.resultsAt && !samePlayers(old.boards, p.boards)
  }) ?? []
  const shownInPreview = preview?.rounds.find((r) => r.round === previewRound) ?? preview?.rounds[0]

  return (
    <section id="ed-pairings" className="ed-section">
      <div className="ed-section-head">
        <h2>Pairings and Results</h2>
        {canEdit && (
          <div className="ed-section-actions">
            <button className="ui-btn ui-btn--small" disabled={busy || dirty} title={locked} onClick={() => input.current?.click()}>
              <Icon name="upload" size={14} /> Import TRF
            </button>
            {current && (
              <button className="ui-btn ui-btn--small ui-btn--danger" disabled={dirty} title={locked} onClick={() => remove(current)}>
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
            if (f) load(f, division)
            e.target.value = ''
          }}
        />
      </div>

      {divisions.length > 1 && (
        <div className="pr-rounds pr-divisions" role="tablist" aria-label="Division">
          {divisions.map((x) => (
            <button key={x.id} role="tab" aria-selected={x.id === division} disabled={dirty && x.id !== division} title={locked} className={x.id === division ? 'pr-round pr-round--on' : 'pr-round'} onClick={() => (setDivision(x.id), setShown(null))}>
              {x.name}
            </button>
          ))}
        </div>
      )}

      {current ? (
        <>
          <div className="pr-head">
            <h3>{current.title || `Pairing of round ${current.round}`}</h3>
            <div className="pr-rounds" role="tablist" aria-label="Round">
              {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
                const has = all.some((r) => r.round === n)
                return (
                  <button key={n} role="tab" aria-selected={current.round === n} disabled={!has || (dirty && current.round !== n)} title={!has ? `Round ${n} – not imported yet` : (dirty && current.round !== n && locked) || `Round ${n}`} className={current.round === n ? 'pr-round pr-round--on' : 'pr-round'} onClick={() => setShown(n)}>
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
          {canResults ? (
            <>
              <PairingTable boards={current.boards} isYou={isYou} resultCell={resultCell} />
              <div className="pr-release">
                <span className="muted small">
                  {current.resultsAt ? `Results released ${format(new Date(current.resultsAt), 'd MMM, h:mm a')}${unreleased ? ' – newer changes aren’t released yet' : ''}` : 'Results not released'}
                </span>
                <button className="ui-btn ui-btn--small" disabled={!dirty} onClick={() => writeResults(false)}>
                  Save draft
                </button>
                <button className="ui-btn ui-btn--small ui-btn--primary" disabled={!complete || !unreleased} title={complete ? undefined : 'Every board needs a result'} onClick={() => writeResults(true)}>
                  {current.resultsAt ? 'Release again' : 'Release results'}
                </button>
              </div>
            </>
          ) : (
            // The public sees a round's results once they're released.
            <PairingTable boards={current.boards.map((b) => ({ ...b, result: b.releasedResult ?? '' }))} isYou={isYou} />
          )}
        </>
      ) : (
        <p className="muted">No pairings yet. Import the TRF file exported from Vega or Swiss-Manager (.csv and .xlsx round exports work too).</p>
      )}

      {preview && shownInPreview && (
        <Modal title="Import pairings" onClose={() => setPreview(null)} width={980}>
          <div className="modal-body">
            <div className="pr-preview-head">
              {divisions.length > 1 && (
                <label className="form-row">
                  <span>Division</span>
                  <select className="ui-input" value={preview.division} disabled={busy} onChange={(e) => load(preview.file, e.target.value)}>
                    {divisions.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
              )}
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
                {preview.rounds.length} {preview.rounds.length === 1 ? 'round' : 'rounds'} from {preview.file.name}
                {replacing > 0 && ` · replaces ${replacing} already here`}
              </span>
            </div>
            {unreleasing.length > 0 && (
              <p className="pg-note pg-note--warn">
                The pairings changed in {unreleasing.map((r) => `round ${r.round}`).join(', ')}, so {unreleasing.length === 1 ? 'its results' : 'their results'} will need releasing again.
              </p>
            )}
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

export function Player({ s, color, you }: { s: PairingSide; color: 'white' | 'black'; you: boolean }) {
  return (
    <span className="pr-player">
      {s.sno && <span className={`pr-sno pr-sno--${color}`}>{s.sno}</span>}
      {s.title ? <TitlePill title={s.title} /> : <span className="pr-title--none" aria-hidden />}
      <span className="pr-name">
        {s.name}
        {you && <span className="pr-you">you</span>}
      </span>
    </span>
  )
}

const Fed = ({ code }: { code: string }) => (code ? <span className="pr-fed">{code}</span> : null)

export function PairingTable({
  boards, isYou, resultCell,
}: {
  boards: PairingBoard[]
  isYou: (s: PairingSide | null) => boolean
  /** In place of the result text, e.g. a dropdown to enter it. */
  resultCell?: (b: PairingBoard) => ReactNode
}) {
  return (
    <div className="pr-wrap">
      <table className="pr-table tbl-striped">
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
                <td className="pr-c pr-result">{resultCell ? resultCell(b) : b.result || '–'}</td>
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
