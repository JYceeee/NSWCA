export const TOKEN_GROUPS = [
  {
    id: 'brand',
    label: 'Brand',
    tokens: [
      'primary', 'primary-hover', 'primary-tint', 'on-primary',
      'secondary', 'secondary-hover', 'secondary-tint', 'on-secondary',
      'link',
    ],
  },
  {
    id: 'surfaces',
    label: 'Surfaces',
    tokens: ['dark', 'on-dark', 'dark-active-bg', 'dark-active-text', 'bg', 'panel', 'card'],
  },
  { id: 'neutrals', label: 'Neutrals', tokens: ['heading', 'text', 'muted', 'subtle'] },
  { id: 'borders', label: 'Borders & Dividers', tokens: ['border', 'border-light', 'border-strong'] },
  {
    id: 'status',
    label: 'Status',
    tokens: ['success', 'success-tint', 'warning', 'warning-tint', 'danger', 'danger-tint'],
  },
  { id: 'charts', label: 'Charts', tokens: ['chart-1', 'chart-2'] },
] as const

export type TokenKey = (typeof TOKEN_GROUPS)[number]['tokens'][number]

export const TOKEN_KEYS: TokenKey[] = TOKEN_GROUPS.flatMap((g) => [...g.tokens])

/** Editing the key token can auto-update these derived ones. */
export const DERIVED: Partial<Record<TokenKey, { hover: TokenKey; tint: TokenKey }>> = {
  primary: { hover: 'primary-hover', tint: 'primary-tint' },
  secondary: { hover: 'secondary-hover', tint: 'secondary-tint' },
}
