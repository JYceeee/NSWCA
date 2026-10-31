import type { ReactNode } from 'react'
import { useAssetUrl } from '../brand/shared'
import { isDarkImage, safeUrl, sectionHeight } from '../data/pages'
import { useBrand } from '../store/BrandStore'
import type { PageButton, PageHeadConfig, PageId, PageImage } from '../types'

/** Uploaded background with its overlay. No image yet: a brand gradient. */
export function PageBackdrop({ image }: { image: PageImage }) {
  const url = useAssetUrl(image.assetId)
  return (
    <div className="bg-layer">
      {image.assetId ? url && <img src={url} alt="" /> : <div className="st-placeholder" />}
      {image.assetId && <div className="bg-overlay" style={{ background: `rgba(0,0,0,${image.overlay / 100})` }} />}
    </div>
  )
}

/** Title and intro of a page, on a banner when Page Config gives it an image. */
export function PageHeadView({ head, title, intro, className, actions, preview }: { head: PageHeadConfig; title: string; intro?: ReactNode; className?: string; actions?: ReactNode; preview?: boolean }) {
  const banner = !!head.image.assetId
  const dark = banner && isDarkImage(head.image)
  const cls = ['page-head', className, banner && 'page-head--banner', dark && 'page-head--dark', head.height > 0 && 'page-head--tall'].filter(Boolean).join(' ')
  return (
    <header className={cls} data-surface={banner ? (dark ? 'dark' : 'light') : undefined} style={{ minHeight: sectionHeight(head.height, preview) }}>
      {banner && <PageBackdrop image={head.image} />}
      <div>
        <h1>{head.title.trim() || title}</h1>
        {(head.intro.trim() || intro) && <p>{head.intro.trim() || intro}</p>}
      </div>
      {actions}
    </header>
  )
}

/** `children` is the page's own intro: Page Config's wording replaces it. */
export function PageHead({ page, title, children, className, actions }: { page: PageId; title: string; children?: ReactNode; className?: string; actions?: ReactNode }) {
  const { saved } = useBrand()
  return <PageHeadView head={saved.pages[0].heads[page]} title={title} intro={children} className={className} actions={actions} />
}

/** A link set in Page Config. Nothing shows until it has a label and somewhere to go. */
export function SiteButton({ button, variant, preview }: { button: PageButton; variant: 'primary' | 'soft'; preview?: boolean }) {
  const { navigate } = useBrand()
  const { link, label } = button
  if (!label.trim() || link.kind === 'none') return null
  const cls = `st-btn st-btn--${variant}`
  if (link.kind === 'page')
    return (
      <a className={cls} href={`#${link.page}`} onClick={(e) => (e.preventDefault(), preview || navigate({ page: link.page }))}>
        {label}
      </a>
    )
  const url = safeUrl(link.url)
  if (!url) return null
  return (
    <a className={cls} href={url} target="_blank" rel="noreferrer" onClick={(e) => preview && e.preventDefault()}>
      {label}
    </a>
  )
}
