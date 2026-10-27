import type { Player } from '../types'
import { TITLES } from './pairings'
import { checkPlayer } from './players'
import { splitName } from './playerList'

type Key = Exclude<keyof Player, 'id' | 'added'>
export type PlayerDraft = Partial<Record<Key, string>>
export type PlayerDetails = Omit<Player, 'id' | 'added'>

export const draftOf = (p?: Player): PlayerDraft => (p ? { ...p } : { fed: 'AUS' })

/** Checks the form like a players-template row. Returns a reason when it can't be saved. */
export function checkDraft(f: PlayerDraft): { player?: PlayerDetails; reason?: string } {
  const lastName = (f.lastName ?? '').trim()
  const firstName = (f.firstName ?? '').trim()
  if (!lastName) return { reason: 'Last name is required' }
  if (lastName.includes(',') || firstName.includes(',')) return { reason: 'Names can’t contain a comma' }
  const { entry, reason } = checkPlayer({
    Name: `${lastName}, ${firstName}`,
    Federation: f.fed,
    DOB: f.dob,
    Gender: f.gender,
    Title: f.title,
    'FIDE ID': f.fideId,
    'K FIDE': f.kFide,
    'FIDE Standard': f.fideStandard,
    'FIDE Rapid': f.fideRapid,
    'FIDE Blitz': f.fideBlitz,
    'ACF ID': f.acfId,
    Email: f.email,
  })
  if (!entry) return { reason }
  const acfRating = (f.acfRating ?? '').trim()
  if (acfRating && !/^\d{1,4}$/.test(acfRating)) return { reason: `ACF rating should be a number, not “${acfRating}”` }
  return {
    player: {
      ...splitName(`${lastName}, ${firstName}`),
      dob: entry.dob ?? '',
      gender: entry.gender ?? '',
      fed: entry.fed ?? '',
      title: entry.title ?? '',
      fideId: entry.fideId,
      kFide: entry.kFide ?? '',
      fideStandard: entry.fideStandard ?? '',
      fideRapid: entry.fideRapid ?? '',
      fideBlitz: entry.fideBlitz ?? '',
      acfId: entry.acfId,
      acfRating,
      email: entry.email,
    },
  }
}

/** The player details form (All players › Edit / New player, tournament › Add › Add new player). */
export function PlayerFields({ f, set, onEnter }: { f: PlayerDraft; set: (k: Key, v: string) => void; onEnter?: () => void }) {
  const text = (k: Key, label: string, placeholder = '', required = false, autoFocus = false) => (
    <label className="form-row">
      <span>
        {label} {required && <span className="ds-required">*</span>}
      </span>
      <input
        className="ui-input"
        autoFocus={autoFocus}
        value={f[k] ?? ''}
        placeholder={placeholder}
        onChange={(e) => set(k, e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </label>
  )
  const pick = (k: Key, label: string, options: string[], empty: string) => (
    <label className="form-row">
      <span>{label}</span>
      <select className="ui-input" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">{empty}</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  )
  return (
    <>
      <div className="ev-form-pair">
        {text('lastName', 'Last name', 'Surname', true, true)}
        {text('firstName', 'First name')}
      </div>
      <div className="ev-form-pair">
        <label className="form-row">
          <span>DOB</span>
          <input className="ui-input" type="date" value={f.dob ?? ''} onChange={(e) => set('dob', e.target.value)} />
        </label>
        {pick('gender', 'Gender', ['M', 'F'], '—')}
      </div>
      <div className="ev-form-pair">
        {text('fed', 'Federation', 'E.g. AUS')}
        {pick('title', 'Title', TITLES.slice(0, 8), 'None')}
      </div>
      <div className="ev-form-pair">
        {text('fideId', 'FIDE ID')}
        {pick('kFide', 'K FIDE', ['10', '20', '40'], 'Optional')}
      </div>
      <div className="ev-form-three">
        {text('fideStandard', 'FIDE Standard', 'Optional')}
        {text('fideRapid', 'FIDE Rapid', 'Optional')}
        {text('fideBlitz', 'FIDE Blitz', 'Optional')}
      </div>
      <div className="ev-form-pair">
        {text('acfId', 'ACF ID')}
        {text('acfRating', 'ACF rating', 'Optional – leave empty if unrated')}
      </div>
      {text('email', 'Email', 'Optional – links to their profile')}
    </>
  )
}
