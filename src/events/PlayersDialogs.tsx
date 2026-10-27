import { useRef, useState } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { detailsOf } from '../data/eventDetails'
import { uid } from '../store/BrandStore'
import type { CalEvent, EventEntry, Player } from '../types'
import { EditPlayerDialog, usePlayers, useProfileSync } from '../admin/AllPlayersPage'
import { draftOf } from './PlayerFields'
import { dmy, entryFields, fullName, searchPlayers, splitName } from './playerList'
import { downloadPlayersTemplate, isSamePlayer, PLAYER_COLUMNS, readPlayers, type PlayerRow } from './players'

type SetEvent = (fn: (e: CalEvent) => CalEvent) => void

/** Add players to the tournament: search All players, or add a new player. */
export function AddPlayerDialog({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const { toast } = useDialogs()
  const { commit, players } = usePlayers()
  const syncProfile = useProfileSync()
  const divisions = detailsOf(event).divisions.filter((x) => x.name.trim())
  const [division, setDivision] = useState(divisions[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [step, setStep] = useState<'search' | 'new'>('search')
  const entries = event.entries ?? []
  const entered = (p: Player) => entries.some((x) => x.playerId === p.id || isSamePlayer(x, entryFields(p)))
  const rows = searchPlayers(players, query)

  /** Enters the player (and lists a new one) in one save. */
  const enter = (p: Player, isNew: boolean) => {
    const entry: EventEntry = { ...entryFields(p), id: uid('entry'), division, at: new Date().toISOString(), source: 'manual' }
    commit((b) => ({
      ...b,
      players: isNew ? [...(b.players ?? []), p] : b.players,
      events: b.events.map((e) => (e.id === event.id ? { ...e, entries: [...(e.entries ?? []), entry] } : e)),
    }))
    toast(`${fullName(p)} added to ${event.name}`)
  }

  const divisionPicker = divisions.length > 0 && (
    <label className="pp-division">
      Division
      <select className="ui-input" value={division} onChange={(e) => setDivision(e.target.value)}>
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </label>
  )

  if (step === 'new') {
    // A search that looks like a name starts the form off – typed last name first, like the table.
    const words = query.trim().split(/\s+/)
    const guess = /\d/.test(query) ? { lastName: '', firstName: '' } : query.includes(',') ? splitName(query) : { lastName: words[0], firstName: words.slice(1).join(' ') }
    return (
      <EditPlayerDialog
        title="Add new player"
        saveLabel={`Add to ${event.name}`}
        player={guess.lastName ? ({ ...draftOf(), lastName: guess.lastName, firstName: guess.firstName } as Player) : undefined}
        players={players}
        above={divisionPicker}
        onSave={(d) => {
          const p: Player = { ...d, id: uid('pl'), added: new Date().toISOString() }
          enter(p, true)
          syncProfile(undefined, p)
        }}
        onBack={() => setStep('search')}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal title="Add player" onClose={onClose} width={720}>
      <div className="modal-body">
        <div className="ap-add-bar">
          <div className="cal-search ap-search">
            <Icon name="search" size={15} />
            <input
              className="ui-input"
              autoFocus
              placeholder="Search last name, first name, DOB, FIDE ID or ACF ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {divisionPicker}
        </div>
        <div className="ap-pick">
          <table className="ae-table">
            <thead>
              <tr>
                {['Last name', 'First name', 'DOB', 'FIDE ID', 'ACF ID', ''].map((h, i) => (
                  <th key={i}>
                    <span className="ae-sort">{h}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="ap-last">{p.lastName}</td>
                  <td>{p.firstName}</td>
                  <td>{dmy(p.dob)}</td>
                  <td>{p.fideId}</td>
                  <td>{p.acfId}</td>
                  <td className="ap-actions">
                    {entered(p) ? (
                      <span className="ae-source ae-source--signup">Entered</span>
                    ) : (
                      <button className="ui-btn ui-btn--small ui-btn--primary" onClick={() => enter(p, false)}>
                        <Icon name="plus" size={13} /> Add
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="ae-empty muted" colSpan={6}>
                    {query ? `No player matches “${query}”.` : 'No players in All players yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="modal-actions ap-add-actions">
        <button className="ui-btn" onClick={() => setStep('new')}>
          <Icon name="plus" size={14} /> Add new player
        </button>
        <span className="ae-toolbar-gap" />
        <button className="ui-btn ui-btn--primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  )
}

const STATUS: Record<PlayerRow['status'], string> = { new: 'New', duplicate: 'Already entered', problem: 'Problem' }

/** Import players from the Excel / CSV players template. */
export function ImportPlayersDialog({ event, setEvent, onClose }: { event: CalEvent; setEvent: SetEvent; onClose: () => void }) {
  const { toast } = useDialogs()
  const input = useRef<HTMLInputElement>(null)
  const divisions = detailsOf(event).divisions.filter((x) => x.name.trim())
  const [division, setDivision] = useState(divisions[0]?.id ?? '')
  const [file, setFile] = useState<string | null>(null)
  const [rows, setRows] = useState<PlayerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  const load = async (f: File) => {
    setFile(f.name)
    setError(null)
    setRows(null)
    try {
      setRows(await readPlayers(f, event.entries ?? [], divisions, () => uid('entry')))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be read.')
    }
  }

  const ok = rows?.filter((r) => r.status === 'new') ?? []
  const count = (s: PlayerRow['status']) => rows?.filter((r) => r.status === s).length ?? 0

  const run = () => {
    const add = ok.map((r) => ({ ...r.entry!, division: r.entry!.division || division, source: 'import' as const }))
    setEvent((e) => ({ ...e, entries: [...(e.entries ?? []), ...add] }))
    toast(`Imported ${add.length} player${add.length === 1 ? '' : 's'}`)
    onClose()
  }

  return (
    <Modal title="Import players" onClose={onClose} width={820}>
      <div className="modal-body">
        <div
          className={over ? 'dropzone dropzone--over' : 'dropzone'}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) load(f)
          }}
        >
          <Icon name="upload" size={22} />
          <div>
            <strong>{file ?? 'Drop the players file (.xlsx or .csv) here'}</strong>
            <span className="small">Columns: {PLAYER_COLUMNS.join(', ')}.</span>
          </div>
          <button className="ui-btn" onClick={() => input.current?.click()}>
            {file ? 'Choose another file' : 'Choose file'}
          </button>
          <button className="ui-btn" onClick={() => downloadPlayersTemplate().catch(() => toast('Could not create the template'))}>
            <Icon name="download" size={14} /> Template
          </button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".xlsx,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) load(f)
              e.target.value = ''
            }}
          />
        </div>
        {error && <p className="form-error ie-error">{error}</p>}
        {rows && (
          <>
            <div className="ie-summary">
              <span className="ie-pill ie-pill--new">{count('new')} new</span>
              <span className="ie-pill ie-pill--update">{count('duplicate')} already entered – skipped</span>
              <span className="ie-pill ie-pill--problem">{count('problem')} with problems – skipped</span>
              {divisions.length > 0 && (
                <label className="pp-division">
                  Division for rows without one
                  <select className="ui-input" value={division} onChange={(e) => setDivision(e.target.value)}>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="ie-table-wrap">
              <table className="ie-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Fed</th>
                    <th>DOB</th>
                    <th>Title</th>
                    <th>FIDE ID</th>
                    <th>FIDE Std</th>
                    <th>FIDE Rapid</th>
                    <th>FIDE Blitz</th>
                    <th>ACF ID</th>
                    <th>Division</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row} className={`ie-row--${r.status === 'new' ? 'new' : 'problem'}`}>
                      <td>{r.row}</td>
                      <td>
                        <span className={`ie-pill ie-pill--${r.status === 'new' ? 'new' : r.status === 'duplicate' ? 'update' : 'problem'}`}>{STATUS[r.status]}</span>
                        {r.reason && <div className="ie-reason">{r.reason}</div>}
                      </td>
                      <td>{r.entry?.name ?? r.name}</td>
                      <td>{r.entry?.fed}</td>
                      <td>{r.entry?.dob}</td>
                      <td>{r.entry?.title}</td>
                      <td>{r.entry?.fideId}</td>
                      <td>{r.entry?.fideStandard}</td>
                      <td>{r.entry?.fideRapid}</td>
                      <td>{r.entry?.fideBlitz}</td>
                      <td>{r.entry?.acfId}</td>
                      <td>{r.entry ? divisions.find((d) => d.id === r.entry!.division)?.name ?? '' : ''}</td>
                      <td>{r.entry?.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Cancel</button>
        <button className="ui-btn ui-btn--primary" disabled={!ok.length} onClick={run}>
          Import {ok.length} player{ok.length === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  )
}
