import { forwardRef, type CSSProperties } from 'react'
import { LogoImage } from '../brand/LogosTab'
import { Icon, socialIcon } from '../components/Icon'
import { logoHeight } from '../data/logos'
import { pageLabel, SOCIALS } from '../data/menus'
import { lookPrefix, mv } from '../lib/menuTheme'
import { ty } from '../lib/theme'
import { hashFor, useApplied, useBrand } from '../store/BrandStore'
import type { BarVersion, FooterCell, MenuSet } from '../types'

/** Footer grid: columns of cells (page links, headings, text, logo, copyright, social icons). */
export const AppFooter = forwardRef<HTMLElement, { menu: MenuSet; version: BarVersion }>(function AppFooter({ menu, version }, ref) {
  const p = lookPrefix('footer', version)
  const c = (k: string) => mv(p, `c-${k}`)
  const { columns } = menu.footer
  return (
    <footer ref={ref} className="app-footer" style={{ background: c('bg'), borderTop: `1px solid ${c('divider')}`, padding: `${mv(p, 'padY')} ${mv(p, 'padX')}` }}>
      <div className="ft-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`, columnGap: mv(p, 'colGap'), rowGap: mv(p, 'rowGap') }}>
        {columns.map((col) => (
          <div key={col.id} className="ft-col" style={{ gap: mv(p, 'rowGap') }}>
            {col.cells.map((cell, i) => (
              <FooterCellView key={i} cell={cell} menu={menu} version={version} />
            ))}
          </div>
        ))}
      </div>
    </footer>
  )
})

export function FooterCellView({ cell, menu, version }: { cell: FooterCell; menu: MenuSet; version: BarVersion }) {
  const { ui, navigate } = useBrand()
  const logos = useApplied('logos')
  const p = lookPrefix('footer', version)
  const c = (k: string) => mv(p, `c-${k}`)
  const link = { '--hov': c('linkHover') } as CSSProperties
  switch (cell.kind) {
    case 'empty':
      return <span className="ft-empty" style={ty(`${p}-link`)} aria-hidden />
    case 'heading':
      return <div style={{ ...ty(`${p}-heading`), color: c('heading') }}>{cell.text}</div>
    case 'page':
      return (
        <a
          className="ft-link"
          href={`#${hashFor({ ...ui, page: cell.page, eventId: null })}`}
          style={{ ...ty(`${p}-link`), color: c('link'), ...link }}
          onClick={(e) => {
            e.preventDefault()
            navigate({ page: cell.page })
          }}
        >
          {pageLabel(cell.page)}
        </a>
      )
    case 'text':
      return cell.url ? (
        <a className="ft-link" href={cell.url} target="_blank" rel="noreferrer" style={{ ...ty(`${p}-text`), color: c('link'), ...link }}>
          {cell.text}
        </a>
      ) : (
        <div style={{ ...ty(`${p}-text`), color: c('text') }}>{cell.text}</div>
      )
    case 'copyright':
      return <div style={{ ...ty(`${p}-text`), color: c('text') }}>{cell.text}</div>
    case 'logo':
      return (
        <div className="ft-logo">
          <LogoImage set={logos} slot={version === 'dark' ? 'reversed' : 'primary'} height={logoHeight(logos, version === 'dark' ? 'reversed' : 'primary')} />
        </div>
      )
    case 'social': {
      const on = menu.footer.socials.filter((s) => s.on)
      return (
        <div className="ft-social">
          {on.map((s) => (
            <a
              key={s.platform}
              className="ft-link"
              href={s.url || undefined}
              target="_blank"
              rel="noreferrer"
              aria-label={SOCIALS.find((x) => x.platform === s.platform)?.label}
              style={{ color: c('icon'), ...link }}
              onClick={(e) => !s.url && e.preventDefault()}
            >
              <Icon name={socialIcon(s.platform)} size={18} />
            </a>
          ))}
        </div>
      )
    }
  }
}
