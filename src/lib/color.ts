export interface RGB { r: number; g: number; b: number }
export interface HSV { h: number; s: number; v: number }
export interface HSL { h: number; s: number; l: number }

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n))

export function normalizeHex(input: string): string | null {
  let h = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('')
  if (/^[0-9a-f]{4}$/i.test(h)) h = h.split('').map((c) => c + c).join('')
  if (/^[0-9a-f]{6}$/i.test(h) || /^[0-9a-f]{8}$/i.test(h)) return '#' + h.toUpperCase()
  return null
}

export function hexToRgb(hex: string): RGB {
  const h = (normalizeHex(hex) ?? '#000000').slice(1, 7)
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

/** Alpha (0–100) embedded in an 8-digit hex, or 100. */
export function hexAlpha(hex: string): number {
  const h = normalizeHex(hex)
  if (!h || h.length !== 9) return 100
  return Math.round((parseInt(h.slice(7, 9), 16) / 255) * 100)
}

export function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((n) => Math.round(clamp(n)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function withAlphaHex(hex: string, alpha: number): string {
  const base = rgbToHex(hexToRgb(hex))
  if (alpha >= 100) return base
  return base + Math.round((clamp(alpha, 0, 100) / 100) * 255).toString(16).padStart(2, '0').toUpperCase()
}

export function toCss(hex: string, alpha = 100): string {
  const a = (alpha / 100) * (hexAlpha(hex) / 100)
  if (a >= 1) return rgbToHex(hexToRgb(hex))
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${+a.toFixed(3)})`
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let [r, g, b] = [0, 0, 0]
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  const { h } = rgbToHsv({ r, g, b })
  return { h, s, l }
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const v = l + c / 2
  return hsvToRgb({ h: h % 360, s: v ? (2 * (v - l)) / v : 0, v })
}

export function mix(a: string, b: string, weightB: number): string {
  const x = hexToRgb(a), y = hexToRgb(b)
  return rgbToHex({
    r: x.r + (y.r - x.r) * weightB,
    g: x.g + (y.g - x.g) * weightB,
    b: x.b + (y.b - x.b) * weightB,
  })
}

/** Hover shade: a little darker than the base. */
export const deriveHover = (hex: string) => mix(hex, '#000000', 0.12)
/** Tint: very light version of the base. */
export const deriveTint = (hex: string) => mix(hex, '#FFFFFF', 0.9)
