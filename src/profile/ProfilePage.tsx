import { differenceInCalendarDays, differenceInYears, format, isAfter, startOfToday, subYears } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAssetUrl } from '../brand/shared'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { Popover } from '../components/Popover'
import { AU_STATES, COUNTRIES, countryName, dialCode } from '../data/countries'
import { fmtDate, toDate } from '../data/events'
import { deleteAsset, putAsset } from '../lib/db'
import { uid, useBrand } from '../store/BrandStore'
import type { Profile } from '../types'
import { fedCode } from '../pairing/engine'
import { TITLES } from '../events/pairings'
import { Combobox } from './Combobox'
import { MyResults, MyTournaments } from './ProfileTabs'

type ProfileTab = 'info' | 'tournaments' | 'results'
const PROFILE_TABS: { id: ProfileTab; label: string; icon: string }[] = [
  { id: 'info', label: 'Personal info', icon: 'user' },
  { id: 'tournaments', label: 'My tournaments', icon: 'calendar' },
  { id: 'results', label: 'My results', icon: 'grid' },
]

export const PREFIXES = ['', 'Mr.', 'Mrs.', 'Ms.', 'Miss', 'Mx.', 'Dr.', 'Prof.']
export const SEXES = ['Male', 'Female', 'Other', 'Prefer not to say']
const MAX_PHOTO = 5 * 1024 * 1024

export const emptyProfile = (): Profile => ({
  photo: null, prefix: '', firstName: '', middleName: '', lastName: '', email: '', phoneCountry: 'AU', phone: '',
  street: '', apartment: '', suburb: '', state: '', postcode: '', country: 'AU', dob: '', sex: '', citizenship: '', occupation: '', clubs: '', fideId: '', acfId: '', fideStandard: '', fideRapid: '', fideBlitz: '', acfRating: '', federation: '', kFide: '', title: '', joinDate: '', renewDate: '',
})

type Key = Exclude<keyof Profile, 'photo' | 'membershipHistory'>
type Errors = Partial<Record<Key, string>>

const REQUIRED: Key[] = ['firstName', 'lastName', 'email', 'phone', 'street', 'suburb', 'state', 'postcode', 'country', 'dob', 'sex']

export function validate(p: Profile): Errors {
  const e: Errors = {}
  for (const k of REQUIRED) if (!(p[k] ?? '').trim()) e[k] = 'Required'
  if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = 'Enter a valid email address, e.g. john@doe.com'
  const digits = p.phone.replace(/\D/g, '')
  if (p.phone.trim() && (digits.length < 6 || digits.length > 15 || /[^\d\s()+-]/.test(p.phone))) e.phone = 'Enter a valid phone number'
  if (p.fideId.trim() && !/^\d{1,10}$/.test(p.fideId.trim())) e.fideId = 'A FIDE number is digits only, e.g. 3209660'
  if (p.acfId.trim() && !/^\d{1,10}$/.test(p.acfId.trim())) e.acfId = 'An ACF ID is digits only'
  if ((p.federation ?? '').trim() && !/^[A-Za-z]{3}$/.test((p.federation ?? '').trim())) e.federation = 'Use the 3-letter federation code, e.g. AUS'
  for (const k of ['fideStandard', 'fideRapid', 'fideBlitz', 'acfRating'] as const) if ((p[k] ?? '').trim() && !/^\d{1,4}$/.test((p[k] ?? '').trim())) e[k] = 'A rating is a number, e.g. 1850'
  if (p.renewDate && p.renewDate > fmtDate(new Date())) e.renewDate = 'Last renew date can’t be in the future'
  else if (p.joinDate && p.renewDate && p.renewDate < p.joinDate) e.renewDate = 'Last renew date can’t be before the join date'
  if (p.joinDate && p.joinDate > fmtDate(new Date())) e.joinDate = 'Join date can’t be in the future'
  if (p.country === 'AU' && p.postcode.trim() && !/^\d{4}$/.test(p.postcode.trim())) e.postcode = 'Australian postcodes have 4 digits'
  if (p.dob) {
    const d = toDate(p.dob)
    if (isNaN(+d)) e.dob = 'Enter a valid date'
    else if (isAfter(d, new Date())) e.dob = 'Date of birth can’t be in the future'
    else if (isAfter(subYears(new Date(), 120), d)) e.dob = 'Date of birth is more than 120 years ago'
  }
  return e
}

const fullName = (p: Profile) => [p.prefix, p.firstName, p.middleName, p.lastName].filter((x) => x.trim()).join(' ')
const age = (p: Profile) => (p.dob ? differenceInYears(new Date(), toDate(p.dob)) : null)
const initials = (p: Profile) => ((p.firstName.trim()[0] ?? '') + (p.lastName.trim()[0] ?? '')).toUpperCase() || '?'
/** Whole days from the join date to today; null when not a member. */
const daysSinceJoining = (p: Profile) => (p.joinDate ? Math.max(0, differenceInCalendarDays(startOfToday(), toDate(p.joinDate))) : null)
const daysText = (n: number) => `${n.toLocaleString('en-AU')} ${n === 1 ? 'day' : 'days'}`

const longDate = (d: string) => (d ? format(toDate(d), 'd MMMM yyyy') : '—')

type History = NonNullable<Profile['membershipHistory']>

/** The saved history, or one rebuilt from the two dates for profiles saved before history existed. */
export function membershipHistory(p: Profile): History {
  if (p.membershipHistory?.length) return p.membershipHistory
  const h: History = []
  if (p.joinDate) h.push({ kind: 'join', date: p.joinDate })
  if (p.renewDate) h.push({ kind: 'renew', date: p.renewDate })
  return h
}

/** Join the first time, renew after that – today, added to the history. */
export function joinOrRenew(p: Profile): Pick<Profile, 'joinDate' | 'renewDate' | 'membershipHistory'> {
  const today = fmtDate(startOfToday())
  const history = membershipHistory(p)
  if (!p.joinDate) return { joinDate: today, renewDate: p.renewDate, membershipHistory: [...history, { kind: 'join', date: today }] }
  return { joinDate: p.joinDate, renewDate: today, membershipHistory: [...history, { kind: 'renew', date: today }] }
}

/** Keeps the history in step with dates edited in the form: the join entry and the latest renewal follow them. */
function syncHistory(before: Profile, after: Profile): History {
  let h = membershipHistory(before).map((x) => ({ ...x }))
  if (after.joinDate !== before.joinDate) {
    h = h.filter((x) => x.kind !== 'join')
    if (after.joinDate) h.push({ kind: 'join', date: after.joinDate })
  }
  if (after.renewDate !== before.renewDate) {
    const last = h.reduce((best, x, i) => (x.kind === 'renew' && (best < 0 || x.date >= h[best].date) ? i : best), -1)
    if (!after.renewDate) h = h.filter((x) => x.kind !== 'renew')
    else if (last >= 0) h[last].date = after.renewDate
    else h.push({ kind: 'renew', date: after.renewDate })
  }
  return h.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'join' ? -1 : 1))
}

const phoneText = (p: Profile) => (p.phone.trim() ? `${p.phoneCountry} +${dialCode(p.phoneCountry)} ${p.phone.trim()}` : '')

export function ProfilePage() {
  const { saved, saveProfile, setProfileDirty } = useBrand()
  const { confirm, toast } = useDialogs()
  const profile = useMemo(() => ({ ...emptyProfile(), ...saved.profile }), [saved.profile])
  const [draft, setDraft] = useState<Profile | null>(null)
  const [tab, setTab] = useState<ProfileTab>('info')
  const [errors, setErrors] = useState<Errors>({})
  /** Photos uploaded during this edit – removed again if not saved. */
  const uploads = useRef<string[]>([])
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(profile)

  useEffect(() => {
    setProfileDirty(dirty)
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty, setProfileDirty])

  // Leaving the page (after the prompt) drops unsaved uploads.
  useEffect(
    () => () => {
      setProfileDirty(false)
      for (const id of uploads.current) deleteAsset(id).catch(() => {})
    },
    [setProfileDirty],
  )

  const startEdit = () => {
    setDraft(structuredClone(profile))
    setErrors({})
    window.scrollTo(0, 0)
  }

  const cancel = async () => {
    if (dirty && !(await confirm({ title: 'Discard your changes?', message: 'Your profile goes back to how it was.', confirmLabel: 'Discard', danger: true }))) return
    for (const id of uploads.current) deleteAsset(id).catch(() => {})
    uploads.current = []
    setDraft(null)
    setErrors({})
  }

  const save = () => {
    if (!draft) return
    const trimmed = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as unknown as Profile
    trimmed.federation = (trimmed.federation ?? '').toUpperCase()
    const e = validate(trimmed)
    setErrors(e)
    if (Object.keys(e).length) {
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>('[aria-invalid="true"]')
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      })
      return
    }
    // The old photo goes once the new one is saved.
    if (profile.photo && profile.photo.assetId !== trimmed.photo?.assetId) deleteAsset(profile.photo.assetId).catch(() => {})
    uploads.current = uploads.current.filter((id) => id !== trimmed.photo?.assetId)
    for (const id of uploads.current) deleteAsset(id).catch(() => {})
    uploads.current = []
    saveProfile({ ...trimmed, membershipHistory: syncHistory(profile, trimmed) })
    setProfileDirty(false)
    setDraft(null)
    toast('Profile saved')
  }

  const joinRenew = async () => {
    const next = joinOrRenew(profile)
    const joining = !profile.joinDate
    const ok = await confirm({
      title: joining ? 'Join the club?' : 'Renew your membership?',
      message: joining ? `Your membership starts today, ${longDate(next.joinDate)}.` : `Your membership is renewed today, ${longDate(next.renewDate)}.`,
      confirmLabel: joining ? 'Join' : 'Renew',
    })
    if (!ok) return
    saveProfile({ ...profile, ...next })
    toast(joining ? 'Welcome – membership started' : 'Membership renewed')
  }

  const uploadPhoto = async (f: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('Please choose a JPG, PNG or WebP image')
    if (f.size > MAX_PHOTO) return toast('That image is over 5 MB')
    const id = uid('asset')
    try {
      await putAsset({ id, name: f.name, type: f.type, blob: f })
    } catch {
      return toast('Could not store the image in this browser')
    }
    uploads.current.push(id)
    setDraft((d) => d && { ...d, photo: { assetId: id, mime: f.type } })
  }

  return (
    <div className="brand-page profile-page">
      <header className="page-head">
        <h1>Profile</h1>
        <p>Your personal details, tournaments and results. Saved in this browser.</p>
      </header>
      {!draft && (
        <div className="brand-tabs pf-tabs" role="tablist">
          {PROFILE_TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="brand-tab" onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
        </div>
      )}
      {!draft && tab === 'tournaments' ? (
        <MyTournaments p={profile} />
      ) : !draft && tab === 'results' ? (
        <MyResults p={profile} />
      ) : draft ? (
        <EditProfile
          p={draft}
          errors={errors}
          set={(patch) => {
            setDraft((d) => d && { ...d, ...patch })
            // Clear an error as soon as its field changes.
            setErrors((e) => {
              const n = { ...e }
              for (const k of Object.keys(patch)) delete n[k as Key]
              return n
            })
          }}
          onPhoto={uploadPhoto}
          dirty={dirty}
          onCancel={cancel}
          onSave={save}
        />
      ) : (
        <ViewProfile p={profile} onEdit={startEdit} onJoinRenew={joinRenew} />
      )}
    </div>
  )
}

function Avatar({ p, size }: { p: Profile; size: number }) {
  const url = useAssetUrl(p.photo?.assetId)
  return url ? (
    <img className="pf-avatar" src={url} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="pf-avatar pf-avatar--initials" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
      {initials(p)}
    </span>
  )
}

// ---------- View ----------

function ViewProfile({ p, onEdit, onJoinRenew }: { p: Profile; onEdit: () => void; onJoinRenew: () => void }) {
  const name = fullName(p)
  const a = age(p)
  const joined = daysSinceJoining(p)
  const empty = !name && !p.email
  const dash = (v: string) => v.trim() || '—'
  return (
    <>
      <section className="pf-header">
        <Avatar p={p} size={72} />
        <div className="pf-header-text">
          <h2>{name || 'Your name'}</h2>
          {empty ? (
            <p>Your profile is empty – click Edit Profile to add your details.</p>
          ) : (
            (a != null || joined != null) && <p>{[a != null && `Age ${a}`, joined != null && `${daysText(joined)} since joining`].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <button className="ui-btn ui-btn--primary" onClick={onEdit}>
          <Icon name="edit" size={15} /> Edit Profile
        </button>
      </section>
      {/* Left: Personal, My membership, Your chess level. Right: Contact, Address, Other. Phones read row by row. */}
      <div className="pf-cards">
        <div className="pf-col">
          <Card title="Personal" order={1}>
            <Row label="Name" value={dash(name)} />
            <Row label="Date of birth" value={p.dob ? format(toDate(p.dob), 'd MMMM yyyy') : '—'} />
            <Row label="Sex" value={dash(p.sex)} />
            <Row label="Citizenship" value={p.citizenship ? countryName(p.citizenship) : '—'} />
          </Card>
          <Card
            title="My membership"
            order={3}
            action={
              <button className="ui-btn ui-btn--primary ui-btn--small" onClick={onJoinRenew}>
                Join/Renew
              </button>
            }
          >
            <Row label="Join date" value={longDate(p.joinDate)} />
            <Row label="Days since joining" value={joined != null ? daysText(joined) : '—'} />
            <Row label="Last renew date" value={longDate(p.renewDate)} extra={<RenewHistory p={p} />} />
          </Card>
          <Card title="Your chess level" order={5}>
            <Row label="FIDE number" value={dash(p.fideId)} />
            <Row label="ACF ID" value={dash(p.acfId)} />
            <Row label="Federation" value={(p.federation || fedCode(p.citizenship)).toUpperCase() || '—'} />
            <Row label="Title" value={dash(p.title ?? '')} />
            <Row label="FIDE Standard" value={dash(p.fideStandard ?? '')} />
            <Row label="FIDE Rapid" value={dash(p.fideRapid ?? '')} />
            <Row label="FIDE Blitz" value={dash(p.fideBlitz ?? '')} />
            <Row label="K FIDE" value={dash(p.kFide ?? '')} />
            <Row label="ACF rating" value={dash(p.acfRating ?? '')} />
          </Card>
        </div>
        <div className="pf-col">
          <Card title="Contact" order={2}>
            <Row label="Email" value={dash(p.email)} />
            <Row label="Phone" value={phoneText(p) || '—'} />
          </Card>
          <Card title="Address" order={4}>
            <Row label="Street" value={dash(p.street)} />
            <Row label="Apartment, suite" value={dash(p.apartment)} />
            <Row label="Suburb" value={dash(p.suburb)} />
            <Row label="State" value={dash(p.state)} />
            <Row label="Postcode" value={dash(p.postcode)} />
            <Row label="Country" value={p.country ? countryName(p.country) : '—'} />
          </Card>
          <Card title="Other" order={6}>
            <Row label="Occupation" value={dash(p.occupation)} />
            <Row label="Chess club(s)" value={dash(p.clubs)} multiline />
          </Card>
        </div>
      </div>
    </>
  )
}

/** `order` is the position once the columns stack on phones. */
function Card({ title, order, action, children }: { title: string; order: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="pf-card" style={{ order }}>
      <div className="pf-card-head">
        <h3>{title}</h3>
        {action}
      </div>
      <dl>{children}</dl>
    </section>
  )
}

function Row({ label, value, multiline, extra }: { label: string; value: string; multiline?: boolean; extra?: ReactNode }) {
  return (
    <div className="pf-row">
      <dt>
        {label}
        {extra}
      </dt>
      <dd className={[value === '—' && 'pf-empty', multiline && 'pf-multiline'].filter(Boolean).join(' ')}>{value}</dd>
    </div>
  )
}

/** ⓘ after "Last renew date": pops out every join and renewal, newest first. */
function RenewHistory({ p }: { p: Profile }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const history = [...membershipHistory(p)].reverse()
  return (
    <>
      <button
        className="pf-info"
        aria-label="Renew history"
        title="Renew history"
        onClick={(e) => setRect(rect ? null : e.currentTarget.getBoundingClientRect())}
      >
        <Icon name="info" size={15} />
      </button>
      {rect && (
        <Popover rect={rect} onClose={() => setRect(null)} label="Renew history">
          <div className="pop-day-title">Renew history</div>
          {history.length ? (
            <ol className="pf-history">
              {history.map((h, i) => (
                <li key={i}>
                  <span className={`pf-history-kind pf-history-kind--${h.kind}`}>{h.kind === 'join' ? 'Joined' : 'Renewed'}</span>
                  <span>{longDate(h.date)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              No membership yet – use Join/Renew to start one.
            </p>
          )}
        </Popover>
      )}
    </>
  )
}

// ---------- Edit ----------

const countryOptions = COUNTRIES.map((c) => ({ value: c.code, label: c.name }))
const dialOptions = COUNTRIES.map((c) => ({ value: c.code, label: `${c.code} +${c.dial} · ${c.name}`, keywords: `+${c.dial}` }))

function EditProfile({
  p, errors, set, onPhoto, dirty, onCancel, onSave,
}: {
  p: Profile
  errors: Errors
  set: (patch: Partial<Profile>) => void
  onPhoto: (f: File) => void
  dirty: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const req = (k: Key) => REQUIRED.includes(k)

  /** One label | input row. */
  const field = (k: Key, label: string, control: ReactNode) => (
    <div className="pf-edit-row" key={k}>
      <label className="ds-field-label" htmlFor={`pf-${k}`}>
        {label} {req(k) && <span className="ds-required">*</span>}
      </label>
      <div className="pf-control">
        {control}
        {errors[k] && <span className="ds-field-error">{errors[k]}</span>}
      </div>
    </div>
  )
  const input = (k: Key, label: string, placeholder = '', type = 'text') =>
    field(
      k,
      label,
      <input
        id={`pf-${k}`}
        type={type}
        className={errors[k] ? 'ds-input ds-input--error' : 'ds-input'}
        aria-invalid={!!errors[k] || undefined}
        value={p[k] ?? ''}
        placeholder={placeholder}
        onChange={(e) => set({ [k]: e.target.value })}
      />,
    )
  const select = (k: Key, label: string, options: string[], placeholder: string) =>
    field(
      k,
      label,
      <select
        id={`pf-${k}`}
        className={errors[k] ? 'ds-input ds-input--error' : 'ds-input'}
        aria-invalid={!!errors[k] || undefined}
        value={p[k]}
        onChange={(e) => set({ [k]: e.target.value })}
      >
        {!options.includes('') && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o || placeholder}
          </option>
        ))}
      </select>,
    )

  const au = p.country === 'AU'

  return (
    <div className="pf-edit">
      <section className="pf-section">
        <h3>Personal</h3>
        <div className="pf-edit-row">
          <span className="ds-field-label">Photo</span>
          <div
            className={over ? 'pf-photo pf-photo--over' : 'pf-photo'}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const f = e.dataTransfer.files[0]
              if (f) onPhoto(f)
            }}
          >
            <Avatar p={p} size={72} />
            <div className="pf-photo-actions">
              <button className="ui-btn ui-btn--small" onClick={() => fileInput.current?.click()}>
                <Icon name="upload" size={14} /> {p.photo ? 'Replace' : 'Upload'}
              </button>
              {p.photo && (
                <button className="ui-btn ui-btn--small ui-btn--danger" onClick={() => set({ photo: null })}>
                  <Icon name="trash" size={14} /> Remove
                </button>
              )}
              <span className="muted small">JPG, PNG or WebP up to 5 MB – or drop it here</span>
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onPhoto(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>
        {select('prefix', 'Prefix', PREFIXES, 'None')}
        {input('firstName', 'First name', 'E.g. John')}
        {input('middleName', 'Middle name', 'E.g. Mark')}
        {input('lastName', 'Last name', 'E.g. Doe')}
        {input('dob', 'Date of birth', '', 'date')}
        {select('sex', 'Sex', SEXES, 'Sex')}
        {field(
          'citizenship',
          'Citizenship',
          <Combobox ariaLabel="Citizenship" value={p.citizenship} options={countryOptions} onChange={(citizenship) => set({ citizenship })} placeholder="Search countries…" />,
        )}
      </section>

      <section className="pf-section">
        <h3>My membership</h3>
        {input('joinDate', 'Join date', '', 'date')}
        {input('renewDate', 'Last renew date', '', 'date')}
      </section>

      <section className="pf-section">
        <h3>Your chess level</h3>
        {input('fideId', 'FIDE number', 'E.g. 3209660')}
        {input('acfId', 'ACF ID', 'Australian Chess Federation ID')}
        {input('federation', 'Federation', fedCode(p.citizenship) ? `${fedCode(p.citizenship)} (from citizenship)` : 'E.g. AUS')}
        {select('title', 'Title', TITLES.slice(0, 8), 'None')}
        {input('fideStandard', 'FIDE Standard', 'Optional – leave empty if unrated')}
        {input('fideRapid', 'FIDE Rapid', 'Optional – leave empty if unrated')}
        {input('fideBlitz', 'FIDE Blitz', 'Optional – leave empty if unrated')}
        {select('kFide', 'K FIDE', ['10', '20', '40'], 'Optional')}
        {input('acfRating', 'ACF rating', 'Optional – leave empty if unrated')}
      </section>

      <section className="pf-section">
        <h3>Contact</h3>
        {input('email', 'Email address', 'E.g. john@doe.com', 'email')}
        {field(
          'phone',
          'Phone',
          <div className="pf-phone">
            <Combobox
              ariaLabel="Country code"
              className="pf-dial"
              value={p.phoneCountry}
              options={dialOptions}
              display={(o) => (o ? `${o.value} +${dialCode(o.value)}` : '')}
              onChange={(phoneCountry) => set({ phoneCountry })}
              placeholder="Country or +code"
              listWidth={300}
            />
            <input
              id="pf-phone"
              type="tel"
              className={errors.phone ? 'ds-input ds-input--error' : 'ds-input'}
              aria-invalid={!!errors.phone || undefined}
              value={p.phone}
              placeholder={p.phoneCountry === 'AU' ? 'E.g. 0400 000 000' : 'Phone number'}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>,
        )}
      </section>

      <section className="pf-section">
        <h3>Address</h3>
        {input('street', 'Street address', 'E.g. 42 Wallaby Way')}
        {input('apartment', 'Apartment, suite, etc')}
        {input('suburb', 'Suburb', 'E.g. Sydney')}
        {au ? select('state', 'State', AU_STATES, 'Choose a state') : input('state', 'State', 'State / province / region')}
        {input('postcode', 'Postcode', au ? 'E.g. 2000' : '')}
        {field(
          'country',
          'Country',
          <Combobox
            ariaLabel="Country"
            value={p.country}
            options={countryOptions}
            invalid={!!errors.country}
            // A state only carries over when it still fits: Australian states stay with Australia.
            onChange={(country) => set({ country, state: (country === 'AU') === AU_STATES.includes(p.state) ? p.state : '' })}
          />,
        )}
      </section>

      <section className="pf-section">
        <h3>Other</h3>
        {input('occupation', 'Occupation')}
        {field(
          'clubs',
          'Chess club(s)',
          <textarea id="pf-clubs" className="ds-input" rows={5} value={p.clubs} onChange={(e) => set({ clubs: e.target.value })} />,
        )}
      </section>

      <div className="save-bar">
        <span className={dirty ? 'save-status save-status--dirty' : 'save-status'}>{dirty ? 'Editing profile – unsaved changes' : 'Editing profile'}</span>
        <button className="ui-btn" onClick={onCancel}>Cancel</button>
        <button className="ui-btn ui-btn--primary" onClick={onSave}>Save</button>
      </div>
    </div>
  )
}
