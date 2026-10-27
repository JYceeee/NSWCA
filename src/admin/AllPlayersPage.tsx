import { useEffect, useState, type ReactNode } from 'react'
import { Modal, useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { dateRangeLabel } from '../data/events'
import { detailsOf } from '../data/eventDetails'
import { dmy, entryFields, findPlayer, fullName, playerStatus, profileChanges, searchPlayers, STATUS_LABEL } from '../events/playerList'
import { emptyProfile } from '../profile/ProfilePage'
import { checkDraft, draftOf, PlayerFields, type PlayerDetails, type PlayerDraft } from '../events/PlayerFields'
import { useEventBook } from '../events/useEventBook'
import { uid, useBrand } from '../store/BrandStore'
import type { CalEvent, EventBook, Player } from '../types'

/** Passes a player's edits on to the profile when the player has an account. Returns true if the profile changed. */
export function useProfileSync() {
  const { saved, saveProfile } = useBrand()
  return (before: Player | undefined, after: Player) => {
    const profile = { ...emptyProfile(), ...saved.profile }
    const patch = profileChanges(before, after, profile)
    if (patch) saveProfile({ ...profile, ...patch })
    return !!patch
  }
}

/** The player list, built from the tournament entries the first time it's opened. */
export function usePlayers() {
  const { book, commit } = useEventBook()
  useEffect(() => {
    if (!book.players) commit((b) => b)
  }, [book.players]) // eslint-disable-line react-hooks/exhaustive-deps
  return { book, commit, players: book.players ?? [] }
}

/** Tournaments a player is entered in. */
const enteredIn = (book: EventBook, id: string) =>
  book.events.flatMap((e) => (e.entries ?? []).filter((x) => x.playerId === id).map((x) => ({ event: e, entry: x })))

const locked = (e: CalEvent) => (e.pairings ?? []).length > 0

/** Admin › All players: every player's details in one place. */
export function AllPlayersPage() {
  const { book, commit, players } = usePlayers()
  const { confirm, toast } = useDialogs()
  const syncProfile = useProfileSync()
  const { saved } = useBrand()
  const statusOf = (p: Player) => playerStatus(p, book, saved.profile?.email ?? '')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<{ kind: 'view' | 'edit'; player: Player } | { kind: 'new' } | null>(null)
  const rows = searchPlayers(players, query)

  /** Saves details; entries in tournaments that haven't started pairing get the new details too. */
  const save = (details: PlayerDetails, id?: string) => {
    if (!id) {
      const p: Player = { ...details, id: uid('pl'), added: new Date().toISOString() }
      commit((b) => ({ ...b, players: [...(b.players ?? []), p] }))
      toast(syncProfile(undefined, p) ? `${fullName(p)} added – profile updated` : `${fullName(p)} added`)
      return
    }
    const old = players.find((p) => p.id === id)!
    const p: Player = { ...old, ...details }
    let n = 0
    commit((b) => ({
      ...b,
      players: (b.players ?? []).map((x) => (x.id === id ? p : x)),
      events: b.events.map((e) =>
        locked(e) || !e.entries?.some((x) => x.playerId === id)
          ? e
          : (n++, { ...e, entries: e.entries.map((x) => (x.playerId === id ? { ...x, ...entryFields(p) } : x)) }),
      ),
    }))
    const also = [n && `${n} tournament${n === 1 ? '' : 's'}`, syncProfile(old, p) && 'their profile'].filter(Boolean)
    toast(also.length ? `Saved – also updated in ${also.join(' and ')}` : 'Saved')
  }

  const remove = async (p: Player) => {
    const n = enteredIn(book, p.id).length
    const ok = await confirm({
      title: `Delete ${fullName(p)}?`,
      message: n
        ? `They’re removed from All players. Their ${n} tournament ${n === 1 ? 'entry stays' : 'entries stay'} as they are.`
        : 'They’re removed from All players. You can undo straight after.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    commit((b) => ({ ...b, players: (b.players ?? []).filter((x) => x.id !== p.id) }))
    toast(`${fullName(p)} deleted`, { label: 'Undo', run: () => commit((b) => ({ ...b, players: [...(b.players ?? []), p] })) })
  }

  return (
    <div className="brand-page ap-page">
      <header className="page-head ap-head">
        <div>
          <h1>All players</h1>
          <p>
            Every player’s details in one place – players entered in tournaments are added automatically. {players.length} player{players.length === 1 ? '' : 's'}.
          </p>
        </div>
        <button className="ui-btn ui-btn--primary" onClick={() => setDialog({ kind: 'new' })}>
          <Icon name="plus" size={15} /> New player
        </button>
      </header>

      <div className="ae-toolbar">
        <div className="cal-search ap-search">
          <Icon name="search" size={15} />
          <input className="ui-input" placeholder="Search last name, first name, DOB, FIDE ID or ACF ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {query && (
          <span className="muted small">
            {rows.length} of {players.length}
          </span>
        )}
      </div>

      <div className="ae-wrap">
        <table className="ae-table ap-table">
          <thead>
            <tr>
              {['Last name', 'First name', 'DOB', 'Gender', 'FIDE ID', 'ACF ID', 'Status', 'Action'].map((h) => (
                <th key={h}>
                  <span className="ae-sort">{h}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="ap-last">{p.lastName}</td>
                <td>{p.firstName || <span className="muted">—</span>}</td>
                <td>{dmy(p.dob) || <span className="muted">—</span>}</td>
                <td>{p.gender || <span className="muted">—</span>}</td>
                <td>{p.fideId || <span className="muted">—</span>}</td>
                <td>{p.acfId || <span className="muted">—</span>}</td>
                <td>
                  <span className={`ae-source ap-status--${statusOf(p)}`}>{STATUS_LABEL[statusOf(p)]}</span>
                </td>
                <td className="ap-actions">
                  <button className="ui-btn ui-btn--small" onClick={() => setDialog({ kind: 'view', player: p })}>
                    View
                  </button>
                  <button className="ui-btn ui-btn--small" onClick={() => setDialog({ kind: 'edit', player: p })}>
                    <Icon name="edit" size={13} /> Edit
                  </button>
                  <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => remove(p)}>
                    <Icon name="trash" size={13} /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="ae-empty muted" colSpan={8}>
                  {players.length ? 'No players match your search.' : 'No players yet. Add one with New player, or enter players in a tournament.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'view' && (
        <ViewPlayerDialog book={book} player={dialog.player} onEdit={() => setDialog({ kind: 'edit', player: dialog.player })} onClose={() => setDialog(null)} />
      )}
      {(dialog?.kind === 'edit' || dialog?.kind === 'new') && (
        <EditPlayerDialog
          player={dialog.kind === 'edit' ? dialog.player : undefined}
          players={players}
          onSave={(d) => save(d, dialog.kind === 'edit' ? dialog.player.id : undefined)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}

function ViewPlayerDialog({ book, player: p, onEdit, onClose }: { book: EventBook; player: Player; onEdit: () => void; onClose: () => void }) {
  const { navigate } = useBrand()
  const entered = enteredIn(book, p.id).sort((a, b) => b.event.startDate.localeCompare(a.event.startDate))
  const line = (label: string, v: string) => (
    <div className="ap-line">
      <span>{label}</span>
      <strong>{v || <span className="muted">—</span>}</strong>
    </div>
  )
  return (
    <Modal title={fullName(p)} onClose={onClose} width={560}>
      <div className="modal-body">
        <div className="ap-lines">
          {line('Last name', p.lastName)}
          {line('First name', p.firstName)}
          {line('DOB', dmy(p.dob))}
          {line('Gender', p.gender)}
          {line('Federation', p.fed)}
          {line('Title', p.title)}
          {line('FIDE ID', p.fideId)}
          {line('K FIDE', p.kFide)}
          {line('FIDE Standard', p.fideStandard)}
          {line('FIDE Rapid', p.fideRapid)}
          {line('FIDE Blitz', p.fideBlitz)}
          {line('ACF ID', p.acfId)}
          {line('ACF rating', p.acfRating)}
          {line('Email', p.email)}
        </div>
        <h3 className="ap-sub">Tournaments</h3>
        {entered.length ? (
          <ul className="ap-events">
            {entered.map(({ event: e, entry }) => {
              const div = detailsOf(e).divisions.find((d) => d.id === entry.division)?.name
              return (
                <li key={e.id}>
                  <button
                    className="link-btn"
                    onClick={() => {
                      onClose()
                      navigate({ page: 'events', eventId: e.id, eventEdit: false, eventEntries: false })
                    }}
                  >
                    {e.name}
                  </button>
                  <span className="muted small">
                    {dateRangeLabel(e)}
                    {div ? ` · ${div}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small">Not entered in any tournament yet.</p>
        )}
      </div>
      <div className="modal-actions">
        <button className="ui-btn" onClick={onClose}>Close</button>
        <button className="ui-btn ui-btn--primary" onClick={onEdit}>
          <Icon name="edit" size={14} /> Edit
        </button>
      </div>
    </Modal>
  )
}

export function EditPlayerDialog({
  player,
  players,
  title,
  saveLabel,
  above,
  onSave,
  onBack,
  onClose,
}: {
  player?: Player
  players: Player[]
  title?: string
  saveLabel?: string
  /** Shown above the form, e.g. the division picker. */
  above?: ReactNode
  onSave: (d: PlayerDetails) => void
  /** Shows a Back button (e.g. back to the search). */
  onBack?: () => void
  onClose: () => void
}) {
  const [f, setF] = useState<PlayerDraft>(() => draftOf(player))
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    const { player: d, reason } = checkDraft(f)
    if (!d) return setError(reason ?? 'Check the details')
    const dup = findPlayer(players, { name: fullName(d), email: d.email, fideId: d.fideId, acfId: d.acfId, dob: d.dob }, player?.id)
    // Entering an existing player as new would list them twice.
    if (dup && onBack) return setError(`Already in All players as “${fullName(dup)}” – go back to the search and add them from there`)
    if (dup) return setError(`Already in All players as “${fullName(dup)}”${dup.dob ? ` (born ${dmy(dup.dob)})` : ''}`)
    onSave(d)
    onClose()
  }
  return (
    <Modal title={title ?? (player?.id ? `Edit ${fullName(player)}` : 'New player')} onClose={onClose} width={560}>
      <div className="modal-body form">
        {above}
        <PlayerFields f={f} set={(k, v) => setF((x) => ({ ...x, [k]: v }))} onEnter={submit} />
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="modal-actions">
        {onBack && (
          <>
            <button className="ui-btn" onClick={onBack}>
              <Icon name="chevronLeft" size={14} /> Back to search
            </button>
            <span className="ae-toolbar-gap" />
          </>
        )}
        <button className="ui-btn" onClick={onClose}>Cancel</button>
        <button className="ui-btn ui-btn--primary" onClick={submit}>
          {saveLabel ?? (player?.id ? 'Save' : 'Add player')}
        </button>
      </div>
    </Modal>
  )
}
