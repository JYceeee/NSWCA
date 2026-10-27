// Formatted text is stored as a small, safe subset of HTML. Older values are plain text.

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'P', 'BR', 'UL', 'OL', 'LI', 'A'])
/** Block wrappers browsers add while editing – kept as paragraphs. */
const AS_PARAGRAPH = new Set(['DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE'])

/** Formatted values contain our tags; anything else is older plain text. */
export const isHtml = (s: string) => /<\/?(p|b|strong|i|em|u|s|br|ul|ol|li|a)\b[^>]*>/i.test(s)

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text (blank line = paragraph, "- " lines = bullets) to HTML. */
export function plainToHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const out: string[] = []
      let list: string[] = []
      const flush = () => {
        if (list.length) out.push(`<ul>${list.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>`)
        list = []
      }
      const para: string[] = []
      const flushPara = () => {
        if (para.length) out.push(`<p>${para.map(escape).join('<br>')}</p>`)
        para.length = 0
      }
      for (const line of block.split('\n')) {
        if (/^\s*-\s+/.test(line)) {
          flushPara()
          list.push(line.replace(/^\s*-\s+/, ''))
        } else {
          flush()
          para.push(line)
        }
      }
      flushPara()
      flush()
      return out.join('')
    })
    .join('')
}

/** Keeps only safe tags (bold, italic, underline, strike, paragraphs, lists, links). */
export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const clean = (node: Node, out: Node, outDoc: Document) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return out.appendChild(outDoc.createTextNode(child.textContent ?? ''))
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child as HTMLElement
      const tag = el.tagName
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'TEMPLATE'].includes(tag)) return
      // Bold / italic expressed with inline styles (e.g. pasted from Google Docs).
      const style = el.getAttribute('style') ?? ''
      let target: Node = out
      if (ALLOWED.has(tag) || AS_PARAGRAPH.has(tag)) {
        const keep = AS_PARAGRAPH.has(tag) ? 'P' : tag === 'STRONG' ? 'B' : tag === 'EM' ? 'I' : tag
        const copy = outDoc.createElement(keep)
        if (keep === 'A') {
          const href = el.getAttribute('href') ?? ''
          if (/^(https?:|mailto:|tel:)/i.test(href)) {
            copy.setAttribute('href', href)
            copy.setAttribute('target', '_blank')
            copy.setAttribute('rel', 'noreferrer')
          }
        }
        out.appendChild(copy)
        target = copy
      } else if (/font-weight:\s*(bold|[6-9]00)/i.test(style)) {
        target = out.appendChild(outDoc.createElement('B'))
      } else if (/font-style:\s*italic/i.test(style)) {
        target = out.appendChild(outDoc.createElement('I'))
      }
      clean(el, target, outDoc)
    })
  }
  const outDoc = document.implementation.createHTMLDocument('')
  const root = outDoc.createElement('div')
  clean(doc.body, root, outDoc)
  // Paragraphs inside list items or other paragraphs, and paragraphs wrapping lists: unwrap.
  root.querySelectorAll('p p, li p').forEach((p) => p.replaceWith(...Array.from(p.childNodes)))
  root.querySelectorAll('p').forEach((p) => p.querySelector('ul, ol') && p.replaceWith(...Array.from(p.childNodes)))
  // Empty paragraphs left behind by editing.
  root.querySelectorAll('p').forEach((p) => !p.childNodes.length && p.remove())
  return root.innerHTML
}

/** Stored value (HTML or older plain text) as safe HTML. */
export const toHtml = (v: string) => (isHtml(v) ? sanitize(v) : plainToHtml(v))

/** Stored value as plain text, e.g. for Excel or "is it empty?" checks. */
export function toPlain(v: string): string {
  if (!isHtml(v)) return v
  const doc = new DOMParser().parseFromString(
    v.replace(/<li[^>]*>/gi, '\n- ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|ul|ol)>/gi, '\n'),
    'text/html',
  )
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
