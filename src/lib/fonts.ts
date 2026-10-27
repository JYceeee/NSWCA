export interface FontDef {
  name: string
  category: 'sans' | 'serif' | 'display' | 'mono'
  /** [min, max] for variable fonts, or a list of static weights. */
  weights: [number, number] | number[]
  italic: boolean
  variable: boolean
  /** Installed on the user's machine, not loaded from Google Fonts. */
  local?: boolean
  /** Fonts to use when a local font isn't installed. */
  fallback?: string
}

const v = (name: string, min: number, max: number, italic: boolean, category: FontDef['category'] = 'sans'): FontDef => ({
  name, category, weights: [min, max], italic, variable: true,
})
const s = (name: string, weights: number[], italic: boolean, category: FontDef['category'] = 'sans'): FontDef => ({
  name, category, weights, italic, variable: false,
})

// Local fonts only render on machines that have them installed.
const local = (name: string, weights: number[], italic: boolean, fallback: string, category: FontDef['category'] = 'sans'): FontDef => ({
  name, category, weights, italic, variable: false, local: true, fallback,
})

export const FONTS: FontDef[] = [
  v('Wix Madefor Display', 400, 800, false),
  v('Wix Madefor Text', 400, 800, true),
  v('Montserrat', 100, 900, true),
  v('Inter', 100, 900, true),
  v('Archivo', 100, 900, true),
  v('Roboto', 100, 900, true),
  v('Open Sans', 300, 800, true),
  s('Lato', [100, 300, 400, 700, 900], true),
  s('Poppins', [100, 200, 300, 400, 500, 600, 700, 800, 900], true),
  v('DM Sans', 100, 1000, true),
  v('Manrope', 200, 800, false),
  v('Plus Jakarta Sans', 200, 800, true),
  v('Work Sans', 100, 900, true),
  v('Nunito', 200, 1000, true),
  v('Raleway', 100, 900, true),
  v('Outfit', 100, 900, false),
  v('Sora', 100, 800, false),
  v('Space Grotesk', 300, 700, false),
  v('Figtree', 300, 900, true),
  v('Rubik', 300, 900, true),
  v('Source Sans 3', 200, 900, true),
  s('Barlow', [100, 200, 300, 400, 500, 600, 700, 800, 900], true),
  v('Oswald', 200, 700, false, 'display'),
  s('Bebas Neue', [400], false, 'display'),
  v('Playfair Display', 400, 900, true, 'serif'),
  v('Lora', 400, 700, true, 'serif'),
  v('JetBrains Mono', 100, 800, true, 'mono'),
  // Ships with Microsoft Office on Windows; Futura / Century Gothic are the closest stand-ins.
  local('Tw Cen MT', [400, 700], true, "'Tw Cen MT Std', Futura, 'Century Gothic', sans-serif"),
]

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]

export function fontWeights(name: string): number[] {
  const f = FONTS.find((x) => x.name === name)
  if (!f) return WEIGHTS
  if (f.variable) {
    const [min, max] = f.weights as [number, number]
    return WEIGHTS.filter((w) => w >= min && w <= max)
  }
  return f.weights as number[]
}

export function fontStack(name: string): string {
  const f = FONTS.find((x) => x.name === name)
  if (f?.fallback) return `'${name}', ${f.fallback}`
  const fallback = f?.category === 'serif' ? 'Georgia, serif' : f?.category === 'mono' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'
  return `'${name}', ${fallback}`
}

const loaded = new Set<string>(['Wix Madefor Display', 'JetBrains Mono'])

/** Inject the Google Fonts stylesheet for a font the first time it is used. */
export function ensureFont(name: string) {
  if (loaded.has(name)) return
  const f = FONTS.find((x) => x.name === name)
  if (!f || f.local) return
  loaded.add(name)
  const fam = encodeURIComponent(name).replace(/%20/g, '+')
  let axis: string
  if (f.variable) {
    const [min, max] = f.weights as [number, number]
    axis = f.italic ? `ital,wght@0,${min}..${max};1,${min}..${max}` : `wght@${min}..${max}`
  } else {
    const ws = f.weights as number[]
    axis = f.italic ? `ital,wght@${[...ws.map((w) => `0,${w}`), ...ws.map((w) => `1,${w}`)].join(';')}` : `wght@${ws.join(';')}`
  }
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:${axis}&display=swap`
  document.head.appendChild(link)
}
