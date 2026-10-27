import type { Background, BackgroundType, PatternKind } from '../types'

export const PATTERNS: { value: PatternKind; label: string }[] = [
  { value: 'dots', label: 'Dots' },
  { value: 'grid', label: 'Grid' },
  { value: 'diagonal', label: 'Diagonal lines' },
  { value: 'checks', label: 'Checks' },
  { value: 'waves', label: 'Waves' },
  { value: 'noise', label: 'Noise' },
]

export function blankBackground(id: string, name: string, type: BackgroundType, builtin = false): Background {
  return {
    id, name, builtin, type,
    pattern: { kind: 'dots', color: { token: 'border-strong', alpha: 100 }, base: { token: 'bg', alpha: 100 }, scale: 22 },
    image: { assetId: null, fileName: null, overlay: { token: 'dark', alpha: 45 }, focalX: 50, focalY: 50, blur: 0 },
    video: { assetId: null, fileName: null, overlay: { token: 'dark', alpha: 45 }, blur: 0 },
  }
}

function pattern(id: string, name: string, kind: PatternKind, colorToken: Background['pattern']['color'], base: Background['pattern']['base'], scale: number): Background {
  const b = blankBackground(id, name, 'pattern', true)
  b.pattern = { kind, color: colorToken, base, scale }
  return b
}

export function builtinBackgrounds(): Background[] {
  return [
    pattern('bg-dots', 'Soft dots', 'dots', { token: 'border-strong', alpha: 100 }, { token: 'bg', alpha: 100 }, 22),
    pattern('bg-grid', 'Blueprint grid', 'grid', { token: 'border', alpha: 100 }, { token: 'card', alpha: 100 }, 32),
    pattern('bg-diagonal', 'Brand diagonal', 'diagonal', { token: 'primary', alpha: 14 }, { token: 'primary-tint', alpha: 100 }, 18),
    pattern('bg-waves', 'Dark waves', 'waves', { token: 'primary', alpha: 35 }, { token: 'dark', alpha: 100 }, 60),
    pattern('bg-noise', 'Paper noise', 'noise', { token: 'heading', alpha: 18 }, { token: 'panel', alpha: 100 }, 160),
    blankBackground('bg-photo', 'Photo hero', 'image', true),
    blankBackground('bg-video', 'Video hero', 'video', true),
  ]
}
