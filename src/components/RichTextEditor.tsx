import { useEffect, useRef, useState } from 'react'
import { sanitize, toHtml } from '../lib/richtext'
import { Icon } from './Icon'

type Cmd = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList'

const TOOLS: { cmd: Cmd; label: string; content: React.ReactNode }[] = [
  { cmd: 'bold', label: 'Bold (Ctrl+B)', content: <b>B</b> },
  { cmd: 'italic', label: 'Italic (Ctrl+I)', content: <i style={{ fontFamily: 'Georgia, serif' }}>I</i> },
  { cmd: 'underline', label: 'Underline (Ctrl+U)', content: <u>U</u> },
  { cmd: 'insertUnorderedList', label: 'Bulleted list', content: <Icon name="listBullet" size={16} /> },
  { cmd: 'insertOrderedList', label: 'Numbered list', content: <Icon name="listNumber" size={16} /> },
]

/** Text box with a formatting toolbar. Value is stored as safe HTML. */
export function RichTextEditor({ value, onChange, placeholder, ariaLabel, minHeight = 120 }: { value: string; onChange: (html: string) => void; placeholder?: string; ariaLabel: string; minHeight?: number }) {
  const box = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [linking, setLinking] = useState<{ url: string; range: Range | null } | null>(null)

  // Only rewrite the DOM when the value changes from outside (keeps the cursor while typing).
  useEffect(() => {
    const el = box.current
    if (!el || value === last.current) return
    el.innerHTML = value ? toHtml(value) : ''
    last.current = value
  }, [value])

  const emit = () => {
    const el = box.current
    if (!el) return
    let html = el.textContent?.trim() || el.querySelector('li') ? sanitize(el.innerHTML) : ''
    // Loose text at the top level goes into a paragraph so it reads back as formatted text.
    if (html && !/^\s*<(p|ul|ol)\b/i.test(html)) html = `<p>${html}</p>`
    last.current = html
    onChange(html)
  }

  const refreshState = () => {
    const s: Record<string, boolean> = {}
    for (const t of TOOLS) s[t.cmd] = document.queryCommandState(t.cmd)
    setActive(s)
  }

  const run = (cmd: string, arg?: string) => {
    box.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
    refreshState()
  }

  const startLink = () => {
    const sel = window.getSelection()
    const range = sel && sel.rangeCount && box.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
    const a = (sel?.anchorNode?.parentElement?.closest('a') as HTMLAnchorElement | null) ?? null
    setLinking({ url: a?.getAttribute('href') ?? 'https://', range })
  }

  const applyLink = (remove = false) => {
    if (!linking) return
    const sel = window.getSelection()
    box.current?.focus()
    if (linking.range && sel) {
      sel.removeAllRanges()
      sel.addRange(linking.range)
    }
    if (remove) document.execCommand('unlink')
    else if (/^(https?:\/\/.+|mailto:.+|tel:.+)$/i.test(linking.url.trim())) {
      const url = linking.url.trim()
      // No selection: insert the link text itself.
      if (!linking.range || linking.range.collapsed) document.execCommand('insertHTML', false, `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`)
      else document.execCommand('createLink', false, url)
    }
    setLinking(null)
    emit()
  }

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label={`${ariaLabel} formatting`}>
        {TOOLS.map((t) => (
          <button
            key={t.cmd}
            type="button"
            className={active[t.cmd] ? 'rte-btn rte-btn--on' : 'rte-btn'}
            title={t.label}
            aria-label={t.label}
            aria-pressed={!!active[t.cmd]}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t.cmd)}
          >
            {t.content}
          </button>
        ))}
        <button type="button" className="rte-btn" title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={startLink}>
          <Icon name="link" size={15} />
        </button>
        <button type="button" className="rte-btn" title="Clear formatting" aria-label="Clear formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => run('removeFormat')}>
          <Icon name="x" size={14} />
        </button>
      </div>
      {linking && (
        <div className="rte-link">
          <input
            className="ui-input"
            autoFocus
            value={linking.url}
            aria-label="Link address"
            onChange={(e) => setLinking({ ...linking, url: e.target.value })}
            onKeyDown={(e) => (e.key === 'Enter' ? (e.preventDefault(), applyLink()) : e.key === 'Escape' && setLinking(null))}
          />
          <button type="button" className="ui-btn ui-btn--small ui-btn--primary" onClick={() => applyLink()}>
            Apply
          </button>
          <button type="button" className="ui-btn ui-btn--small" onClick={() => applyLink(true)}>
            Remove link
          </button>
          <button type="button" className="ui-btn ui-btn--small" onClick={() => setLinking(null)}>
            Cancel
          </button>
        </div>
      )}
      <div
        ref={box}
        className="ds-input rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={() => {
          // Text typed straight into the box (e.g. after select-all + delete) goes into a paragraph.
          const el = box.current
          if (el && Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) document.execCommand('formatBlock', false, 'p')
          emit()
        }}
        onKeyUp={refreshState}
        onMouseUp={refreshState}
        onFocus={() => {
          // Work inside paragraphs, so Enter, lists and formatting apply to the right line.
          document.execCommand('defaultParagraphSeparator', false, 'p')
          const el = box.current
          if (el && !el.innerHTML.trim()) {
            el.innerHTML = '<p><br></p>'
            const r = document.createRange()
            r.setStart(el.firstChild!, 0)
            r.collapse(true)
            const sel = window.getSelection()
            sel?.removeAllRanges()
            sel?.addRange(r)
          }
          refreshState()
        }}
        onPaste={(e) => {
          // Paste only clean formatting.
          e.preventDefault()
          const html = e.clipboardData.getData('text/html')
          const text = e.clipboardData.getData('text/plain')
          document.execCommand('insertHTML', false, html ? sanitize(html) : toHtml(text))
          emit()
        }}
      />
    </div>
  )
}
