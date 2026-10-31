import { useState, type CSSProperties } from 'react'
import { useAssetUrl } from '../brand/shared'
import { Icon } from '../components/Icon'
import { heroHeight, isDarkImage, pageSections, safeUrl, sectionHeight } from '../data/pages'
import { useBrand } from '../store/BrandStore'
import type { EmphasisSection, GalleryItem, GallerySection, HeroSection, ListCell, ListSection, PageId, ProjectItem, ProjectsSection, Section } from '../types'
import { PageBackdrop, SiteButton } from './PageHead'

export function HomePage() {
  return <PageSections page="home" />
}

/** The sections a page shows (below its own content, if it has any). */
export function PageSections({ page }: { page: PageId }) {
  const { saved } = useBrand()
  return <SectionsView sections={pageSections(saved.pages[0], page)} />
}

/** `preview` = inside Page Config: not the real page, so links stay put and the top bar ignores it. */
export function SectionsView({ sections, preview }: { sections: Section[]; preview?: boolean }) {
  const shown = sections.filter((s) => s.enabled)
  if (!shown.length) return null
  return (
    <div className={preview ? 'hm hm--preview' : 'hm'}>
      {shown.map((s) => (
        <SectionView key={s.id} section={s} preview={preview} />
      ))}
    </div>
  )
}

function SectionView({ section: s, preview }: { section: Section; preview?: boolean }) {
  switch (s.kind) {
    case 'hero': return <Hero hero={s} preview={preview} />
    case 'gallery': return <Gallery gallery={s} preview={preview} />
    case 'emphasis': return <Emphasis emphasis={s} preview={preview} />
    case 'projects': return <Projects projects={s} preview={preview} />
    case 'list': return <List list={s} preview={preview} />
  }
}

/** Page Config's spacing; null keeps the section's standard padding. */
const spacing = (s: Section) => ({ paddingTop: s.spaceTop ?? undefined, paddingBottom: s.spaceBottom ?? undefined })

function Hero({ hero, preview }: { hero: HeroSection; preview?: boolean }) {
  const dark = isDarkImage(hero.image)
  const style = {
    '--hero-h': heroHeight(hero, preview),
    // The top bar sits over this section, so the space is measured from under it.
    paddingTop: hero.spaceTop == null ? undefined : `calc(var(--topbar-h, 0px) + ${hero.spaceTop}px)`,
    paddingBottom: hero.spaceBottom ?? undefined,
  } as CSSProperties
  return (
    <section className={dark ? 'hm-hero hm-on-dark' : 'hm-hero'} data-surface={dark ? 'dark' : 'light'} style={style}>
      <PageBackdrop image={hero.image} />
      <div className="hm-wrap hm-hero-text">
        <h1>{hero.title}</h1>
        {hero.text && <p>{hero.text}</p>}
        <div className="hm-actions">
          {hero.buttons.map((b, i) => (
            <SiteButton key={b.id} button={b} variant={i === 0 ? 'primary' : 'soft'} preview={preview} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Gallery({ gallery, preview }: { gallery: GallerySection; preview?: boolean }) {
  return (
    <section className="hm-section" style={{ minHeight: sectionHeight(gallery.height), ...spacing(gallery) }}>
      <div className="hm-wrap">
        <h2>{gallery.title}</h2>
        {gallery.text && <p className="hm-lead">{gallery.text}</p>}
        <div className="hm-gallery">
          {gallery.items.map((item) => (
            <GalleryCard key={item.id} item={item} preview={preview} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Emphasis({ emphasis, preview }: { emphasis: EmphasisSection; preview?: boolean }) {
  const dark = isDarkImage(emphasis.image)
  return (
    <section className={dark ? 'hm-emphasis hm-on-dark' : 'hm-emphasis'} data-surface={dark ? 'dark' : 'light'} style={{ minHeight: sectionHeight(emphasis.height), ...spacing(emphasis) }}>
      <PageBackdrop image={emphasis.image} />
      <div className="hm-wrap">
        <h2>{emphasis.title}</h2>
        <div className="hm-points">
          {emphasis.items.map((item) => (
            <div key={item.id} className="hm-point">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <div className="hm-center">
          <SiteButton button={emphasis.button} variant="soft" preview={preview} />
        </div>
      </div>
    </section>
  )
}

function Projects({ projects, preview }: { projects: ProjectsSection; preview?: boolean }) {
  return (
    <section className="hm-section" style={{ minHeight: sectionHeight(projects.height), ...spacing(projects) }}>
      <div className="hm-wrap">
        <h2>{projects.title}</h2>
        <div className="hm-projects">
          {projects.items.map((item) => (
            <ProjectCard key={item.id} item={item} inset={projects.inset} padding={projects.padding} preview={preview} />
          ))}
        </div>
      </div>
    </section>
  )
}

function List({ list, preview }: { list: ListSection; preview?: boolean }) {
  const backdrop = !!list.image.assetId
  const dark = backdrop && isDarkImage(list.image)
  const title = list.showTitle && list.title.trim()
  return (
    <section
      className={dark ? 'hm-section hm-list hm-on-dark' : 'hm-section hm-list'}
      data-surface={backdrop ? (dark ? 'dark' : 'light') : undefined}
      style={{ minHeight: sectionHeight(list.height), ...spacing(list) }}
    >
      {backdrop && <PageBackdrop image={list.image} />}
      <div className="hm-wrap">
        {title && <h2>{list.title}</h2>}
        <div className={title ? 'hm-list-grid hm-list-grid--titled' : 'hm-list-grid'} style={{ '--cols': list.columns.length } as CSSProperties}>
          {list.columns.map((col) => (
            <div key={col.id} className="hm-list-col">
              {col.title.trim() && <h3>{col.title}</h3>}
              {col.cells.map((cell, i) => (
                <ListCellView key={i} cell={cell} preview={preview} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ListCellView({ cell, preview }: { cell: ListCell; preview?: boolean }) {
  const { navigate } = useBrand()
  const url = useAssetUrl(cell.kind === 'image' ? cell.assetId : null)
  if (cell.kind === 'empty') return <span className="hm-list-empty" aria-hidden />
  if (cell.kind === 'image') {
    if (!url) return null
    const { width, height } = cell
    const size: CSSProperties = width && height ? { width, aspectRatio: `${width} / ${height}` } : width ? { width } : height ? { height } : { width: '100%' }
    return <img className="hm-list-img" src={url} alt="" style={size} />
  }
  const { text, link } = cell
  if (link.kind === 'page')
    return (
      <a className="hm-list-link" href={`#${link.page}`} onClick={(e) => (e.preventDefault(), preview || navigate({ page: link.page }))}>
        {text}
      </a>
    )
  const href = link.kind === 'url' ? safeUrl(link.url) : null
  return href ? (
    <a className="hm-list-link" href={href} target="_blank" rel="noreferrer" onClick={(e) => preview && e.preventDefault()}>
      {text}
    </a>
  ) : (
    <p className="hm-list-text">{text}</p>
  )
}

function Picture({ assetId, className }: { assetId: string | null; className: string }) {
  const url = useAssetUrl(assetId)
  return (
    <div className={className}>
      {url ? (
        <img src={url} alt="" />
      ) : (
        !assetId && (
          <div className="st-placeholder st-placeholder--icon">
            <Icon name="image" size={28} />
          </div>
        )
      )}
    </div>
  )
}

function GalleryCard({ item, preview }: { item: GalleryItem; preview?: boolean }) {
  return (
    <article className="hm-card">
      <Picture assetId={item.assetId} className="hm-card-img" />
      <h3>{item.title}</h3>
      <p>{item.text}</p>
      <SiteButton button={item.button} variant="soft" preview={preview} />
    </article>
  )
}

/** The description slides in from the right on hover or keyboard focus; on touch screens a tap shows it. */
function ProjectCard({ item, inset, padding, preview }: { item: ProjectItem; inset: number; padding: number; preview?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <article
      className={open ? 'hm-project is-open' : 'hm-project'}
      tabIndex={0}
      aria-label={item.title}
      style={{ '--inset': `${inset}px`, '--pad': `${padding}px` } as CSSProperties}
      onClick={(e) => (e.target as HTMLElement).closest('a') || setOpen(!open)}
    >
      <Picture assetId={item.assetId} className="hm-project-img" />
      <div className="hm-project-panel">
        {item.label && <span className="hm-project-label">{item.label}</span>}
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <SiteButton button={item.button} variant="soft" preview={preview} />
      </div>
    </article>
  )
}
