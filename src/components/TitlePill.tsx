/** A player's chess title (GM, IM, WFM…) as Brand › Components › Title pill; women's titles get their own border. */
export function TitlePill({ title }: { title: string }) {
  return <span className={/^W/.test(title) ? 'title-pill title-pill--w' : 'title-pill'}>{title}</span>
}
