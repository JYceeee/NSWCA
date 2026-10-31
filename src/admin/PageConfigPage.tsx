import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SaveBar, useAssetUrl } from '../brand/shared'
import { NumberField } from '../brand/TypographyTab'
import { useDialogs } from '../components/Dialogs'
import { Icon } from '../components/Icon'
import { calView } from '../data/events'
import { PAGES } from '../data/menus'
import { isDarkImage, LANDING_PAGES, measureLuminance, newButton, newListCell, newListColumn, newSection, pageSections, PROFILE_FIELD_GROUPS, SECTION_KINDS, SECTION_PAGES } from '../data/pages'
import { putAsset } from '../lib/db'
import { saveSiteDefaults } from '../lib/saveDefaults'
import { CellFrame, ColumnMove, Stepper } from '../menu/FooterGridEditor'
import { ContactView } from '../site/ContactPage'
import { SectionsView } from '../site/HomePage'
import { PageHead, PageHeadView } from '../site/PageHead'
import { referencedAssets, uid, useBrand, useSession } from '../store/BrandStore'
import type { CalMode, EmphasisSection, GalleryItem, GallerySection, HeroSection, ListCell, ListColumn, ListSection, PageButton, PageConfig, PageId, PageImage, PageLink, ProjectsSection, Section, SectionKind, Tone } from '../types'

const MAX_IMAGE = 15 * 1024 * 1024
const MAX_HEIGHT = 3000
const MAX_SPACE = 600
const MAX_LIST_COLS = 6
const MAX_LIST_ROWS = 12

async function uploadImage(file: File): Promise<{ assetId: string; fileName: string; luminance: number | null }> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('Please choose a JPG, PNG or WebP image')
  if (file.size > MAX_IMAGE) throw new Error('That image is over 15 MB')
  const assetId = uid('asset')
  await putAsset({ id: assetId, name: file.name, type: file.type, blob: file })
  return { assetId, fileName: file.name, luminance: await measureLuminance(file) }
}

export function PageConfigPage() {
  const { draft, update } = useBrand()
  const { can } = useSession()
  const [page, setPage] = useState<PageId>('home')
  const cfg = draft.pages[0]
  const set = (fn: (c: PageConfig) => PageConfig) => update('pages', cfg.id, fn)
  const disabled = !can('pages.edit')

  return (
    <div className="brand-page pc-page">
      <PageHead page="pages" title="Page Config" className="ap-head" actions={import.meta.env.DEV && <SaveDefaults />}>
        Choose a page, then set its text, images and options. Nothing changes on the site until you save.
      </PageHead>
      <label className="pc-picker">
        Page
        <select className="ui-input" value={page} onChange={(e) => setPage(e.target.value as PageId)}>
          {PAGES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <div className="pc-layout">
        <fieldset className="pc-form" disabled={disabled}>
          <HeadForm key={page} page={page} cfg={cfg} set={set} />
          {page === 'contact' && <ContactForm cfg={cfg} set={set} />}
          {page === 'events' && <CalendarForm cfg={cfg} set={set} />}
          {page === 'profile' && <ProfileForm cfg={cfg} set={set} />}
          {cfg.sectionPages.includes(page) && <SectionsForm page={page} cfg={cfg} set={set} />}
        </fieldset>
        <Preview page={page} cfg={cfg} />
      </div>
      {!disabled && <SaveBar slice="pages" item={cfg} noReset />}
    </div>
  )
}

/** Dev server only: writes everything saved in this browser into the project, so every deploy starts from it. */
function SaveDefaults() {
  const { saved, dirty } = useBrand()
  const { toast, confirm } = useDialogs()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    if (Object.values(dirty).some(Boolean)) return toast('Save your changes first: only saved settings become defaults')
    const ok = await confirm({
      title: 'Save as site defaults?',
      message: 'Brand, menus, Page Config, calendar settings and their images replace the project’s saved defaults. Events, players and your profile aren’t included.',
      confirmLabel: 'Save as defaults',
    })
    if (!ok) return
    setBusy(true)
    try {
      const n = await saveSiteDefaults(saved, referencedAssets({ ...saved, profile: undefined }))
      toast(`Site defaults saved with ${n} image${n === 1 ? '' : 's'}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the defaults')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className="ui-btn" disabled={busy} onClick={run}>
      <Icon name="download" size={15} /> {busy ? 'Saving…' : 'Save as site defaults'}
    </button>
  )
}

// ---------- Live preview ----------

const DESIGN_WIDTH = 1280

/** The page as it will look, shrunk to fit the column. */
function Preview({ page, cfg }: { page: PageId; cfg: PageConfig }) {
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [height, setHeight] = useState(400)
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (box.current) setScale(box.current.clientWidth / DESIGN_WIDTH)
      if (inner.current) setHeight(inner.current.offsetHeight)
    })
    if (box.current) ro.observe(box.current)
    if (inner.current) ro.observe(inner.current)
    return () => ro.disconnect()
  }, [])
  const label = PAGES.find((p) => p.id === page)?.label ?? page
  return (
    <aside className="pc-preview">
      <span className="section-title">Preview</span>
      <div className="pc-preview-box" ref={box} style={{ height: height * scale }}>
        <div className="pc-preview-inner" ref={inner} style={{ width: DESIGN_WIDTH, transform: `scale(${scale})` }}>
          {page === 'contact' ? (
            <ContactView contact={cfg.contact} preview />
          ) : (
            page !== 'home' && (
              <div className="brand-page">
                <PageHeadView head={cfg.heads[page]} title={label} intro="This page’s own introduction shows here unless you write one." />
                <div className="pc-preview-rest">Page content</div>
              </div>
            )
          )}
          <SectionsView sections={pageSections(cfg, page)} preview />
        </div>
      </div>
    </aside>
  )
}

// ---------- Form parts ----------

function Group({ title, children, on, onToggle, actions }: { title: string; children: ReactNode; on?: boolean; onToggle?: (v: boolean) => void; actions?: ReactNode }) {
  return (
    <section className="pc-group">
      <div className="pc-group-head">
        <h3>{title}</h3>
        <div className="pc-group-actions">
          {actions}
          {onToggle && (
            <label className="check">
              <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> Show section
            </label>
          )}
        </div>
      </div>
      {(on ?? true) && children}
    </section>
  )
}

function Text({ label, value, onChange, rows, type, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; type?: string; hint?: string }) {
  return (
    <label className="pc-field">
      <span>{label}</span>
      {rows ? <textarea className="ui-input" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /> : <input className="ui-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

function Num({ label, value, min, max, onChange, unit, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; unit?: string; hint?: string }) {
  return <OptionalNum label={label} value={value} min={min} max={max} unit={unit} hint={hint} onChange={(n) => n != null && onChange(n)} />
}

/** With `blank`, the field can be left empty, and shows that word. */
function OptionalNum({ label, value, min, max, onChange, unit = 'px', hint, blank }: { label: string; value: number | null; min: number; max: number; onChange: (n: number | null) => void; unit?: string; hint?: string; blank?: string }) {
  return (
    <div className="pc-field">
      <span>{label}</span>
      <div className="pc-num">
        <NumberField value={value} min={min} max={max} onChange={onChange} allowEmpty={blank != null} placeholder={blank} ariaLabel={label} small /> {unit}
      </div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  )
}

/** A section's minimum height; content taller than this makes the section grow. */
function Height({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <Num label="Height" value={value} min={0} max={MAX_HEIGHT} onChange={onChange} hint="Minimum height. 0 = fit the content." />
}

/** Space above the title and below the last element. */
function Spacing({ section, patch }: { section: Section; patch: (p: Pick<Section, 'spaceTop' | 'spaceBottom'>) => void }) {
  const { spaceTop, spaceBottom } = section
  return (
    <div className="pc-row">
      <OptionalNum label="Space above title" value={spaceTop} min={0} max={MAX_SPACE} blank="Auto" hint="Empty = standard spacing" onChange={(n) => patch({ spaceTop: n, spaceBottom })} />
      <OptionalNum label="Space below last element" value={spaceBottom} min={0} max={MAX_SPACE} blank="Auto" hint="Empty = standard spacing" onChange={(n) => patch({ spaceTop, spaceBottom: n })} />
    </div>
  )
}

function ImagePick({ label, assetId, fileName, onFile, onClear }: { label: string; assetId: string | null; fileName: string | null; onFile: (f: File) => void; onClear: () => void }) {
  const url = useAssetUrl(assetId)
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="pc-field">
      <span>{label}</span>
      <div className="pc-image">
        <div className="pc-thumb">{url ? <img src={url} alt="" /> : <Icon name="image" size={20} />}</div>
        <div className="pc-image-side">
          {fileName && <small className="muted">{fileName}</small>}
          <div className="pc-image-btns">
            <button type="button" className="ui-btn ui-btn--small" onClick={() => input.current?.click()}>
              <Icon name="upload" size={14} /> {assetId ? 'Replace' : 'Upload'}
            </button>
            {assetId && (
              <button type="button" className="ui-btn ui-btn--small ui-btn--danger" onClick={onClear}>
                Remove
              </button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function useUpload() {
  const { toast } = useDialogs()
  return async (file: File, done: (r: Awaited<ReturnType<typeof uploadImage>>) => void) => {
    try {
      done(await uploadImage(file))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not upload the image')
    }
  }
}

/** Background image with its overlay and the light / dark reading that the top bar and text follow. */
function BackgroundPick({ label, image, onChange }: { label: string; image: PageImage; onChange: (patch: Partial<PageImage>) => void }) {
  const upload = useUpload()
  return (
    <>
      <ImagePick
        label={label}
        assetId={image.assetId}
        fileName={image.fileName}
        onFile={(f) => upload(f, onChange)}
        onClear={() => onChange({ assetId: null, fileName: null, luminance: null })}
      />
      {image.assetId && (
        <div className="pc-row">
          <Num label="Overlay darkness" unit="%" value={image.overlay} min={0} max={100} onChange={(overlay) => onChange({ overlay })} />
          <label className="pc-field">
            <span>Image is</span>
            <select className="ui-input" value={image.tone} onChange={(e) => onChange({ tone: e.target.value as Tone })}>
              <option value="auto">Auto ({isDarkImage({ ...image, tone: 'auto' }) ? 'dark' : 'light'})</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>
      )}
    </>
  )
}

function LinkEdit({ link, onChange, noneLabel }: { link: PageLink; onChange: (l: PageLink) => void; noneLabel: string }) {
  const kind = (k: PageLink['kind']) => onChange(k === 'none' ? { kind: k } : k === 'page' ? { kind: k, page: 'home' } : { kind: k, url: '' })
  return (
    <>
      <label className="pc-field">
        <span>Goes to</span>
        <select className="ui-input" value={link.kind} onChange={(e) => kind(e.target.value as PageLink['kind'])}>
          <option value="none">{noneLabel}</option>
          <option value="page">A page</option>
          <option value="url">A web address</option>
        </select>
      </label>
      {link.kind === 'page' && (
        <label className="pc-field">
          <span>Page</span>
          <select className="ui-input" value={link.page} onChange={(e) => onChange({ kind: 'page', page: e.target.value as PageId })}>
            {PAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {link.kind === 'url' && <Text label="Web address" value={link.url} onChange={(url) => onChange({ kind: 'url', url })} />}
    </>
  )
}

function ButtonEdit({ button, onChange, title = 'Button text' }: { button: PageButton; onChange: (b: PageButton) => void; title?: string }) {
  return (
    <div className="pc-row pc-row--btn">
      <Text label={title} value={button.label} onChange={(label) => onChange({ ...button, label })} />
      <LinkEdit link={button.link} noneLabel="Nothing (hidden)" onChange={(link) => onChange({ ...button, link })} />
    </div>
  )
}

/** Items that can be added, deleted and dragged (or moved with the arrows) into order. */
function ItemList<T extends { id: string }>({ items, onChange, make, name, title, children }: { items: T[]; onChange: (items: T[]) => void; make: () => T; name: string; title: (item: T, i: number) => string; children: (item: T, set: (patch: Partial<T>) => void) => ReactNode }) {
  const [drag, setDrag] = useState<number | null>(null)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    next.splice(to, 0, next.splice(from, 1)[0])
    onChange(next)
  }
  return (
    <div className="pc-items">
      {items.map((item, i) => (
        <details
          key={item.id}
          className="pc-item"
          onDragOver={(e) => {
            if (drag == null) return
            e.preventDefault()
            if (drag !== i) {
              move(drag, i)
              setDrag(i)
            }
          }}
          onDrop={(e) => (e.preventDefault(), setDrag(null))}
        >
          <summary draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}>
            <span className="pc-grip">
              <Icon name="grip" size={15} />
            </span>
            <span className="pc-item-title">{title(item, i) || `${name} ${i + 1}`}</span>
            <button type="button" className="icon-btn" aria-label={`Move ${name} up`} disabled={i === 0} onClick={(e) => (e.preventDefault(), move(i, i - 1))}>
              <span className="pc-up"><Icon name="chevronDown" size={14} /></span>
            </button>
            <button type="button" className="icon-btn" aria-label={`Move ${name} down`} disabled={i === items.length - 1} onClick={(e) => (e.preventDefault(), move(i, i + 1))}>
              <Icon name="chevronDown" size={14} />
            </button>
            <button type="button" className="icon-btn" aria-label={`Delete ${name}`} onClick={(e) => (e.preventDefault(), onChange(items.filter((x) => x.id !== item.id)))}>
              <Icon name="trash" size={14} />
            </button>
          </summary>
          <div className="pc-item-body">{children(item, (patch) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...patch } : x))))}</div>
        </details>
      ))}
      <button type="button" className="ui-btn ui-btn--small" onClick={() => onChange([...items, make()])}>
        <Icon name="plus" size={14} /> Add {name.toLowerCase()}
      </button>
    </div>
  )
}

type FormProps = { cfg: PageConfig; set: (fn: (c: PageConfig) => PageConfig) => void }

function HeadForm({ page, cfg, set }: FormProps & { page: PageId }) {
  const head = cfg.heads[page]
  const patch = (p: Partial<typeof head>) => set((c) => ({ ...c, heads: { ...c.heads, [page]: { ...c.heads[page], ...p } } }))
  const label = PAGES.find((x) => x.id === page)?.label ?? page
  const content = page === 'home' || page === 'contact'
  const tick = (on: boolean) => set((c) => ({ ...c, sectionPages: on ? [...c.sectionPages, page] : c.sectionPages.filter((p) => p !== page) }))
  return (
    <Group title="Page">
      <Text label="Menu label" value={head.menuLabel} onChange={(menuLabel) => patch({ menuLabel })} hint={`Shown in the menus. Empty = ${label}`} />
      {SECTION_PAGES.includes(page) && (
        <label className="check">
          <input type="checkbox" checked={cfg.sectionPages.includes(page)} onChange={(e) => tick(e.target.checked)} /> Add section
        </label>
      )}
      {!content && (
        <>
          <Text label="Page title" value={head.title} onChange={(title) => patch({ title })} hint="Empty = the page’s standard title" />
          <Text label="Introduction" rows={2} value={head.intro} onChange={(intro) => patch({ intro })} hint="Empty = the page’s standard introduction" />
          <BackgroundPick label="Banner image" image={head.image} onChange={(p) => patch({ image: { ...head.image, ...p } })} />
          <Height value={head.height} onChange={(height) => patch({ height })} />
        </>
      )}
    </Group>
  )
}

const kindLabel = (k: SectionKind) => SECTION_KINDS.find((x) => x.kind === k)?.label ?? k

/** The page's sections in order. A Landing always stays first. */
function SectionsForm({ page, cfg, set }: FormProps & { page: PageId }) {
  const { confirm } = useDialogs()
  const sections = cfg.sections[page] ?? []
  const write = (next: Section[]) => set((c) => ({ ...c, sections: { ...c.sections, [page]: next } }))
  const first = sections[0]?.kind === 'hero' ? 1 : 0
  const move = (i: number, by: -1 | 1) => {
    const next = [...sections]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    write(next)
  }
  const remove = async (s: Section) => {
    const ok = await confirm({ title: `Delete this ${kindLabel(s.kind)} section?`, message: 'To keep it for later, untick Show section instead.', confirmLabel: 'Delete' })
    if (ok) write(sections.filter((x) => x.id !== s.id))
  }
  const add = (kind: SectionKind) => write(kind === 'hero' ? [newSection(kind), ...sections] : [...sections, newSection(kind)])
  const kinds = SECTION_KINDS.filter((k) => k.kind !== 'hero' || (LANDING_PAGES.includes(page) && !first))
  return (
    <>
      {sections.map((s, i) => {
        const patch = (p: Partial<Section>) => write(sections.map((x) => (x.id === s.id ? ({ ...x, ...p } as Section) : x)))
        return (
          <Group
            key={s.id}
            title={`${i + 1}. ${kindLabel(s.kind)}`}
            on={s.enabled}
            onToggle={(enabled) => patch({ enabled })}
            actions={
              <>
                <button type="button" className="icon-btn" aria-label="Move section up" title="Move up" disabled={i <= first} onClick={() => move(i, -1)}>
                  <span className="pc-up"><Icon name="chevronDown" size={14} /></span>
                </button>
                <button type="button" className="icon-btn" aria-label="Move section down" title="Move down" disabled={i < first || i === sections.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevronDown" size={14} />
                </button>
                <button type="button" className="icon-btn" aria-label="Delete section" title="Delete section" onClick={() => remove(s)}>
                  <Icon name="trash" size={14} />
                </button>
              </>
            }
          >
            {s.kind === 'hero' && <HeroForm s={s} patch={patch} />}
            {s.kind === 'gallery' && <GalleryForm s={s} patch={patch} />}
            {s.kind === 'emphasis' && <EmphasisForm s={s} patch={patch} />}
            {s.kind === 'projects' && <ProjectsForm s={s} patch={patch} />}
            {s.kind === 'list' && <ListForm s={s} patch={patch} />}
          </Group>
        )
      })}
      <label className="pc-field">
        <span>Add section</span>
        <select className="ui-input" value="" onChange={(e) => e.target.value && add(e.target.value as SectionKind)}>
          <option value="">Choose a section type…</option>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

type SectionFormProps<T extends Section> = { s: T; patch: (p: Partial<T>) => void }

function Picture<T extends GalleryItem>({ item, patch }: { item: T; patch: (p: Partial<T>) => void }) {
  const upload = useUpload()
  return (
    <ImagePick
      label="Image"
      assetId={item.assetId}
      fileName={item.fileName}
      onFile={(f) => upload(f, (r) => patch({ assetId: r.assetId, fileName: r.fileName } as Partial<T>))}
      onClear={() => patch({ assetId: null, fileName: null } as Partial<T>)}
    />
  )
}

function HeroForm({ s, patch }: SectionFormProps<HeroSection>) {
  return (
    <>
      <Text label="Heading" rows={2} value={s.title} onChange={(title) => patch({ title })} />
      <Text label="Text" rows={3} value={s.text} onChange={(text) => patch({ text })} />
      <BackgroundPick label="Background image" image={s.image} onChange={(p) => patch({ image: { ...s.image, ...p } })} />
      <label className="check">
        <input type="checkbox" checked={s.fullWindow} onChange={(e) => patch({ fullWindow: e.target.checked })} /> Full window
      </label>
      {!s.fullWindow && <Height value={s.height} onChange={(height) => patch({ height })} />}
      <Spacing section={s} patch={patch} />
      <ItemList items={s.buttons} onChange={(buttons) => patch({ buttons })} make={() => newButton()} name="Button" title={(b) => b.label}>
        {(b, edit) => <ButtonEdit button={b} onChange={(n) => edit(n)} />}
      </ItemList>
    </>
  )
}

function GalleryForm({ s, patch }: SectionFormProps<GallerySection>) {
  return (
    <>
      <Text label="Heading" value={s.title} onChange={(title) => patch({ title })} />
      <Text label="Text" rows={2} value={s.text} onChange={(text) => patch({ text })} />
      <Height value={s.height} onChange={(height) => patch({ height })} />
      <Spacing section={s} patch={patch} />
      <ItemList
        items={s.items}
        onChange={(items) => patch({ items })}
        make={() => ({ id: uid('gal'), title: '', text: '', assetId: null, fileName: null, button: newButton('View details') })}
        name="Card"
        title={(i) => i.title}
      >
        {(item, edit) => (
          <>
            <Picture item={item} patch={edit} />
            <Text label="Title" value={item.title} onChange={(title) => edit({ title })} />
            <Text label="Description" rows={3} value={item.text} onChange={(text) => edit({ text })} />
            <ButtonEdit button={item.button} onChange={(button) => edit({ button })} />
          </>
        )}
      </ItemList>
    </>
  )
}

function EmphasisForm({ s, patch }: SectionFormProps<EmphasisSection>) {
  return (
    <>
      <Text label="Heading" value={s.title} onChange={(title) => patch({ title })} />
      <BackgroundPick label="Background image" image={s.image} onChange={(p) => patch({ image: { ...s.image, ...p } })} />
      <Height value={s.height} onChange={(height) => patch({ height })} />
      <Spacing section={s} patch={patch} />
      <ItemList items={s.items} onChange={(items) => patch({ items })} make={() => ({ id: uid('emp'), title: '', text: '' })} name="Point" title={(i) => i.title}>
        {(item, edit) => (
          <>
            <Text label="Title" value={item.title} onChange={(title) => edit({ title })} />
            <Text label="Description" rows={3} value={item.text} onChange={(text) => edit({ text })} />
          </>
        )}
      </ItemList>
      <ButtonEdit button={s.button} onChange={(button) => patch({ button })} />
    </>
  )
}

function ProjectsForm({ s, patch }: SectionFormProps<ProjectsSection>) {
  return (
    <>
      <Text label="Heading" value={s.title} onChange={(title) => patch({ title })} />
      <Height value={s.height} onChange={(height) => patch({ height })} />
      <Spacing section={s} patch={patch} />
      <div className="pc-row">
        <Num label="Text area margin from image" value={s.inset} min={0} max={400} onChange={(inset) => patch({ inset })} hint="Where the sliding panel stops, from the image’s left edge. 0 covers the whole image." />
        <Num label="Padding around the text" value={s.padding} min={0} max={120} onChange={(padding) => patch({ padding })} hint="Space between the panel’s edges and its text." />
      </div>
      <ItemList
        items={s.items}
        onChange={(items) => patch({ items })}
        make={() => ({ id: uid('prj'), label: '', title: '', text: '', assetId: null, fileName: null, button: newButton('View details') })}
        name="Project"
        title={(i) => i.title}
      >
        {(item, edit) => (
          <>
            <Picture item={item} patch={edit} />
            <Text label="Small label" value={item.label} onChange={(label) => edit({ label })} />
            <Text label="Title" value={item.title} onChange={(title) => edit({ title })} />
            <Text label="Description" rows={3} value={item.text} onChange={(text) => edit({ text })} />
            <ButtonEdit button={item.button} onChange={(button) => edit({ button })} />
          </>
        )}
      </ItemList>
    </>
  )
}

function ListForm({ s, patch }: SectionFormProps<ListSection>) {
  return (
    <>
      <Text label="Heading" value={s.title} onChange={(title) => patch({ title })} />
      <label className="check">
        <input type="checkbox" checked={s.showTitle} onChange={(e) => patch({ showTitle: e.target.checked })} /> Show heading
      </label>
      <BackgroundPick label="Background image" image={s.image} onChange={(p) => patch({ image: { ...s.image, ...p } })} />
      <Height value={s.height} onChange={(height) => patch({ height })} />
      <Spacing section={s} patch={patch} />
      <ListGrid columns={s.columns} onChange={(columns) => patch({ columns })} />
    </>
  )
}

const emptyCell = (): ListCell => ({ kind: 'empty' })

const LIST_ELEMENTS = [
  { kind: 'text', label: 'Text / link', icon: 'link' },
  { kind: 'image', label: 'Image', icon: 'image' },
] as const

type ListDrag = { from: 'palette'; kind: 'text' | 'image' } | { from: 'cell'; col: number; row: number }

/** Columns × rows, as in the footer: drag elements into cells, and cells onto each other to swap them. */
function ListGrid({ columns, onChange }: { columns: ListColumn[]; onChange: (c: ListColumn[]) => void }) {
  const [drag, setDrag] = useState<ListDrag | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const edit = (fn: (next: ListColumn[]) => void) => {
    const next = columns.map((c) => ({ ...c, cells: [...c.cells] }))
    fn(next)
    onChange(next)
  }
  const drop = (col: number, row: number) => {
    setOver(null)
    if (!drag) return
    edit((next) => {
      if (drag.from === 'palette') next[col].cells[row] = newListCell(drag.kind)
      else [next[drag.col].cells[drag.row], next[col].cells[row]] = [next[col].cells[row], next[drag.col].cells[drag.row]]
    })
    setDrag(null)
  }
  const setColCount = (n: number) => onChange(n > columns.length ? [...columns, newListColumn()] : columns.slice(0, n))
  const setRowCount = (ci: number, n: number) =>
    edit((next) => {
      const { cells } = next[ci]
      next[ci].cells = n > cells.length ? [...cells, emptyCell()] : cells.slice(0, n)
    })
  const moveCol = (ci: number, by: -1 | 1) => {
    const next = [...columns]
    ;[next[ci], next[ci + by]] = [next[ci + by], next[ci]]
    onChange(next)
  }
  return (
    <div className="pc-items">
      <div className="fg-toolbar">
        <Stepper label="Columns" value={columns.length} min={1} max={MAX_LIST_COLS} onChange={setColCount} />
      </div>
      <span className="muted small">Drag elements into the cells. Drag a filled cell onto another to swap them.</span>
      <div className="fg-palette">
        {LIST_ELEMENTS.map((k) => (
          <span
            key={k.kind}
            draggable
            className="fg-chip"
            title="Drag into a cell"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'copyMove'
              e.dataTransfer.setData('text/plain', k.kind)
              setDrag({ from: 'palette', kind: k.kind })
            }}
            onDragEnd={() => setDrag(null)}
          >
            <Icon name="grip" size={14} stroke={3} /> <Icon name={k.icon} size={14} /> {k.label}
          </span>
        ))}
      </div>
      <div className="fg-grid" style={{ '--cols': columns.length } as CSSProperties}>
        {columns.map((col, ci) => (
          <div key={col.id} className="fg-col">
            <div className="fg-col-head">
              <span className="col-head">
                <strong>Column {ci + 1}</strong>
                <ColumnMove label={`column ${ci + 1}`} first={ci === 0} last={ci === columns.length - 1} onMove={(by) => moveCol(ci, by)} />
              </span>
              <Stepper label="Rows" value={col.cells.length} min={1} max={MAX_LIST_ROWS} onChange={(n) => setRowCount(ci, n)} small />
              {columns.length > 1 && (
                <button type="button" className="icon-btn icon-btn--danger" title="Remove column" onClick={() => onChange(columns.filter((c) => c.id !== col.id))}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
            <input className="ui-input fg-col-title" placeholder="Column title (optional)" value={col.title} onChange={(e) => edit((next) => void (next[ci].title = e.target.value))} aria-label={`Column ${ci + 1} title`} />
            {col.cells.map((cell, ri) => {
              const key = `${ci}-${ri}`
              const change = (c: ListCell) => edit((next) => void (next[ci].cells[ri] = c))
              return (
                <CellFrame
                  key={key}
                  filled={cell.kind !== 'empty'}
                  kind={cell.kind}
                  over={over === key}
                  dragging={drag?.from === 'cell' && drag.col === ci && drag.row === ri}
                  onClear={() => change(emptyCell())}
                  onDragStart={() => setDrag({ from: 'cell', col: ci, row: ri })}
                  onDragEnd={() => {
                    setDrag(null)
                    setOver(null)
                  }}
                  onDragOver={() => drag && setOver(key)}
                  onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={() => drop(ci, ri)}
                >
                  <ListCellEdit cell={cell} onChange={change} />
                </CellFrame>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function ListCellEdit({ cell, onChange }: { cell: ListCell; onChange: (c: ListCell) => void }) {
  const upload = useUpload()
  if (cell.kind === 'text')
    return (
      <>
        <span className="fg-cell-kind"><Icon name="link" size={12} /> Text / link</span>
        <input className="inline-input inline-input--strong" value={cell.text} onChange={(e) => onChange({ ...cell, text: e.target.value })} aria-label="Text" />
        <LinkEdit link={cell.link} noneLabel="Nothing (plain text)" onChange={(link) => onChange({ ...cell, link })} />
      </>
    )
  if (cell.kind === 'image')
    return (
      <>
        <span className="fg-cell-kind"><Icon name="image" size={12} /> Image</span>
        <ImagePick
          label=""
          assetId={cell.assetId}
          fileName={cell.fileName}
          onFile={(f) => upload(f, (r) => onChange({ ...cell, assetId: r.assetId, fileName: r.fileName }))}
          onClear={() => onChange({ ...cell, assetId: null, fileName: null })}
        />
        <div className="pc-row">
          <OptionalNum label="Width" value={cell.width} min={1} max={MAX_HEIGHT} blank="Auto" onChange={(width) => onChange({ ...cell, width })} />
          <OptionalNum label="Height" value={cell.height} min={1} max={MAX_HEIGHT} blank="Auto" onChange={(height) => onChange({ ...cell, height })} />
        </div>
        <small className="muted">Both set: cropped to that shape. One set: keeps its proportions. Neither: fills the column.</small>
      </>
    )
  return null
}

function ContactForm({ cfg, set }: FormProps) {
  const { contact } = cfg
  const patch = (p: Partial<typeof contact>) => set((c) => ({ ...c, contact: { ...c.contact, ...p } }))
  return (
    <>
      <Group title="Left column">
        <Text label="Heading" value={contact.title} onChange={(title) => patch({ title })} />
        <Height value={contact.height} onChange={(height) => patch({ height })} />
        <Text label="Text" rows={3} value={contact.text} onChange={(text) => patch({ text })} />
        <Text label="Contact details" rows={4} value={contact.details} onChange={(details) => patch({ details })} hint="Address, email and phone, one per line" />
        <ItemList items={contact.links} onChange={(links) => patch({ links })} make={() => newButton('Link')} name="Link" title={(b) => b.label}>
          {(b, set2) => <ButtonEdit button={b} title="Link text" onChange={(n) => set2(n)} />}
        </ItemList>
      </Group>
      <Group title="Form">
        <Text label="Inquiry types" rows={5} value={contact.inquiryTypes.join('\n')} onChange={(v) => patch({ inquiryTypes: v.split('\n') })} hint="One per line" />
        <Text label="Thank-you message" rows={2} value={contact.thanks} onChange={(thanks) => patch({ thanks })} hint="Shown after sending" />
      </Group>
      <Group title="Emails">
        <Text label="Send enquiries to" type="email" value={contact.notifyEmail} onChange={(notifyEmail) => patch({ notifyEmail: notifyEmail.trim() })} hint="Empty = enquiries only appear on the Enquiries page" />
        <p className="muted small pc-note">The wording of these emails, including the automatic reply, is in Admin › Email templates.</p>
      </Group>
    </>
  )
}

const MODES: { id: CalMode; label: string }[] = [
  { id: 'week', label: 'One week' },
  { id: 'fortnight', label: 'Fortnight' },
  { id: 'month', label: 'Month' },
]

function CalendarForm({ cfg, set }: FormProps) {
  const { draft } = useBrand()
  const view = calView(draft.events[0])
  const cell = cfg.calendar.cellHeight ?? view.cellHeight
  const hour = cfg.calendar.hourHeight ?? view.hourHeight
  const patch = (p: PageConfig['calendar']) => set((c) => ({ ...c, calendar: { ...c.calendar, ...p } }))
  return (
    <Group title="Calendar">
      <div className="pc-row">
        {MODES.map((m) => (
          <Num key={m.id} label={`${m.label} cell height`} value={cell[m.id]} min={60} max={900} onChange={(n) => patch({ cellHeight: { ...cell, [m.id]: n } })} />
        ))}
      </div>
      <Num label="Hour height (View by day)" value={hour} min={20} max={200} onChange={(hourHeight) => patch({ hourHeight })} />
    </Group>
  )
}

function ProfileForm({ cfg, set }: FormProps) {
  const fields = cfg.profileFields
  const toggle = (key: string, on: boolean) => set((c) => ({ ...c, profileFields: { ...c.profileFields, [key]: on } }))
  return (
    <Group title="What members can edit">
      <p className="muted small pc-note">
        Members complete every field on their first profile save. After that, only the ticked fields stay editable; the rest are view only. Join date and last renew date are always Admin only.
      </p>
      {PROFILE_FIELD_GROUPS.map((g) => (
        <div key={g.name} className="pc-checks">
          <h4>{g.name}</h4>
          <div>
            {g.fields.map((f) => (
              <label key={f.key} className="check">
                <input type="checkbox" checked={fields[f.key] !== false} onChange={(e) => toggle(f.key, e.target.checked)} /> {f.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </Group>
  )
}
