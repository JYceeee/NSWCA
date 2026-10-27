// Helpers shared by pairings and My results.

const TITLES = new Set(['gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm', 'dr', 'mr', 'mrs', 'ms', 'miss', 'mx', 'prof'])

/** "Yang, Joyce", "Yang,Joyce" and "Joyce YANG" give the same key; chess titles are ignored. */
export const nameKey = (n: string) =>
  n
    .toLowerCase()
    .replace(/[^a-z\s,'-]/g, ' ')
    .split(/[\s,]+/)
    .filter((w) => w && !TITLES.has(w))
    .sort()
    .join(' ')

/** 5.5 → "5½" */
export const fmtPoints = (p: number | null) => (p == null ? '—' : `${Math.floor(p)}${p % 1 ? '½' : ''}`.replace(/^0½$/, '½'))
