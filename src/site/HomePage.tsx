import { useState, type CSSProperties } from 'react'
import { useAssetUrl } from '../brand/shared'
import { Icon } from '../components/Icon'
import { heroHeight, isDarkImage, pageSections, safeUrl, sectionHeight } from '../data/pages'
import { ty } from '../lib/theme'
import { useApplied, useBrand } from '../store/BrandStore'
import type { EmphasisSection, GalleryItem, GallerySection, HeroSection, ListCell, ListSection, PageId, ProjectItem, ProjectsSection, Section, TextStyleId } from '../types'
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

/** Styles for a typography row chosen in Page Config. Nothing chosen, or the row was deleted: the section's own look. */
function useTextStyle() {
  const { rows } = useApplied('typography')
  return (id?: TextStyleId) => (id && rows.some((r) => r.id === id) ? ty(`ty-${id}`) : undefined)
}

/** Page Config's spacing; null keeps the section's standard padding. */
const spacing = (s: Section) => ({ paddingTop: s.spaceTop ?? undefined, paddingBottom: s.spaceBottom ?? undefined })

function Hero({ hero, preview }: { hero: HeroSection; preview?: boolean }) {
  const text = useTextStyle()
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
        <h1 style={text(hero.titleStyle)}>{hero.title}</h1>
        {hero.text && <p style={text(hero.textStyle)}>{hero.text}</p>}
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
  const text = useTextStyle()
  return (
    <section className="hm-section" style={{ minHeight: sectionHeight(gallery.height), ...spacing(gallery) }}>
      <div className="hm-wrap">
        <h2 style={text(gallery.titleStyle)}>{gallery.title}</h2>
        {gallery.text && <p className="hm-lead" style={text(gallery.textStyle)}>{gallery.text}</p>}
        <div className="hm-gallery">
          {gallery.items.map((item) => (
            <GalleryCard key={item.id} item={item} titleStyle={gallery.itemTitleStyle} textStyle={gallery.itemTextStyle} preview={preview} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Emphasis({ emphasis, preview }: { emphasis: EmphasisSection; preview?: boolean }) {
  const text = useTextStyle()
  const dark = isDarkImage(emphasis.image)
  return (
    <section className={dark ? 'hm-emphasis hm-on-dark' : 'hm-emphasis'} data-surface={dark ? 'dark' : 'light'} style={{ minHeight: sectionHeight(emphasis.height), ...spacing(emphasis) }}>
      <PageBackdrop image={emphasis.image} />
      <div className="hm-wrap">
        <h2 style={text(emphasis.titleStyle)}>{emphasis.title}</h2>
        <div className="hm-points" style={{ '--per-row': emphasis.perRow, '--per-row-tablet': Math.min(emphasis.perRow, 2) } as CSSProperties}>
          {emphasis.items.map((item) => (
            <div key={item.id} className="hm-point">
              <h3 style={text(emphasis.itemTitleStyle)}>{item.title}</h3>
              <p style={text(emphasis.itemTextStyle)}>{item.text}</p>
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
  const text = useTextStyle()
  return (
    <section className="hm-section" style={{ minHeight: sectionHeight(projects.height), ...spacing(projects) }}>
      <div className="hm-wrap">
        <h2 style={text(projects.titleStyle)}>{projects.title}</h2>
        <div className="hm-projects">
          {projects.items.map((item) => (
            <ProjectCard key={item.id} item={item} section={projects} preview={preview} />
          ))}
        </div>
      </div>
    </section>
  )
}

function List({ list, preview }: { list: ListSection; preview?: boolean }) {
  const text = useTextStyle()
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
        {title && <h2 style={text(list.titleStyle)}>{list.title}</h2>}
        <div className={title ? 'hm-list-grid hm-list-grid--titled' : 'hm-list-grid'} style={{ '--cols': list.columns.length } as CSSProperties}>
          {list.columns.map((col) => (
            <div key={col.id} className="hm-list-col">
              {col.title.trim() && <h3 style={text(list.itemTitleStyle)}>{col.title}</h3>}
              {col.cells.map((cell, i) => (
                <ListCellView key={i} cell={cell} textStyle={list.itemTextStyle} preview={preview} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ListCellView({ cell, textStyle, preview }: { cell: ListCell; textStyle?: TextStyleId; preview?: boolean }) {
  const { navigate } = useBrand()
  const style = useTextStyle()
  const url = useAssetUrl(cell.kind === 'image' ? cell.assetId : null)
  if (cell.kind === 'empty') return <span className="hm-list-empty" aria-hidden />
  if (cell.kind === 'image') {
    if (!url) return null
    const { width, height } = cell
    const size: CSSProperties = width && height ? { width, aspectRatio: `${width} / ${height}` } : width ? { width } : height ? { height } : { width: '100%' }
    return <img className="hm-list-img" src={url} alt="" style={size} />
  }
  const { text, link } = cell
  const look = style(textStyle)
  if (link.kind === 'page')
    return (
      <a className="hm-list-link" style={look} href={`#${link.page}`} onClick={(e) => (e.preventDefault(), preview || navigate({ page: link.page }))}>
        {text}
      </a>
    )
  const href = link.kind === 'url' ? safeUrl(link.url) : null
  return href ? (
    <a className="hm-list-link" style={look} href={href} target="_blank" rel="noreferrer" onClick={(e) => preview && e.preventDefault()}>
      {text}
    </a>
  ) : (
    <p className="hm-list-text" style={look}>{text}</p>
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

function GalleryCard({ item, titleStyle, textStyle, preview }: { item: GalleryItem; titleStyle?: TextStyleId; textStyle?: TextStyleId; preview?: boolean }) {
  const text = useTextStyle()
  return (
    <article className="hm-card">
      <Picture assetId={item.assetId} className="hm-card-img" />
      <h3 style={text(titleStyle)}>{item.title}</h3>
      <p style={text(textStyle)}>{item.text}</p>
      <SiteButton button={item.button} variant="soft" preview={preview} />
    </article>
  )
}

/** The description slides in from the right on hover or keyboard focus; on touch screens a tap shows it. */
function ProjectCard({ item, section, preview }: { item: ProjectItem; section: ProjectsSection; preview?: boolean }) {
  const [open, setOpen] = useState(false)
  const text = useTextStyle()
  return (
    <article
      className={open ? 'hm-project is-open' : 'hm-project'}
      tabIndex={0}
      aria-label={item.title}
      style={{ '--inset': `${section.inset}px`, '--pad': `${section.padding}px` } as CSSProperties}
      onClick={(e) => (e.target as HTMLElement).closest('a') || setOpen(!open)}
    >
      <Picture assetId={item.assetId} className="hm-project-img" />
      <div className="hm-project-panel">
        {item.label && <span className="hm-project-label" style={text(section.itemLabelStyle)}>{item.label}</span>}
        <h3 style={text(section.itemTitleStyle)}>{item.title}</h3>
        <p style={text(section.itemTextStyle)}>{item.text}</p>
        <SiteButton button={item.button} variant="soft" preview={preview} />
      </div>
    </article>
  )
}
