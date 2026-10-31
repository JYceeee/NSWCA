import { useState, type CSSProperties } from 'react'
import { useAssetUrl } from '../brand/shared'
import { Icon } from '../components/Icon'
import { isDarkImage, sectionHeight } from '../data/pages'
import { useBrand } from '../store/BrandStore'
import type { GalleryItem, HomeConfig, ProjectItem } from '../types'
import { PageBackdrop, SiteButton } from './PageHead'

export function HomePage() {
  const { saved } = useBrand()
  return <HomeView home={saved.pages[0].home} />
}

/** The four sections. `preview` = inside Page Config: not the real page, so links stay put and the top bar ignores it. */
export function HomeView({ home, preview }: { home: HomeConfig; preview?: boolean }) {
  const { hero, gallery, emphasis, projects } = home
  const heroDark = isDarkImage(hero.image)
  const emphasisDark = isDarkImage(emphasis.image)
  return (
    <div className={preview ? 'hm hm--preview' : 'hm'}>
      {hero.enabled && (
        <section
          className={heroDark ? 'hm-hero hm-on-dark' : 'hm-hero'}
          data-surface={heroDark ? 'dark' : 'light'}
          style={{ '--hero-h': sectionHeight(hero.height, preview) } as CSSProperties}
        >
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
      )}

      {gallery.enabled && (
        <section className="hm-section" style={{ minHeight: sectionHeight(gallery.height, preview) }}>
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
      )}

      {emphasis.enabled && (
        <section className={emphasisDark ? 'hm-emphasis hm-on-dark' : 'hm-emphasis'} data-surface={emphasisDark ? 'dark' : 'light'} style={{ minHeight: sectionHeight(emphasis.height, preview) }}>
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
      )}

      {projects.enabled && (
        <section className="hm-section" style={{ minHeight: sectionHeight(projects.height, preview) }}>
          <div className="hm-wrap">
            <h2>{projects.title}</h2>
            <div className="hm-projects">
              {projects.items.map((item) => (
                <ProjectCard key={item.id} item={item} inset={projects.inset} padding={projects.padding} preview={preview} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
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
