const PATHS: Record<string, string> = {
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.4 1.5-1.4H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3Z M7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M10.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M15 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  undo: 'M4 9h11a5 5 0 0 1 0 10H8 M4 9l4-4 M4 9l4 4',
  reset: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  plus: 'M12 5v14 M5 12h14',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12 M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5',
  eyedropper: 'M14 4l6 6 M17 3a2 2 0 0 1 4 4l-3 3-4-4 3-3Z M14 6L5 15v4h4l9-9',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
  brand: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M16.5 13a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  spacing: 'M4 5v14 M20 5v14 M8 12h8 M8 12l2-2 M8 12l2 2 M16 12l-2-2 M16 12l-2 2',
  lineHeight: 'M5 4h14 M5 20h14 M12 7v10 M9 9l3-3 3 3 M9 15l3 3 3-3',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9.5a1 1 0 1 0 0-.01',
  video: 'M4 6h11v12H4z M15 10l5-3v10l-5-3',
  grid: 'M4 4h16v16H4z M4 12h16 M12 4v16',
  sidebar: 'M4 4h16v16H4z M9 4v16',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 13.6a6.5 6.5 0 0 1 3.5 6.4',
  swap: 'M7 4v16 M7 4L4 7 M7 4l3 3 M17 20V4 M17 20l-3-3 M17 20l3-3',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 11v5 M12 8h.01',
  listBullet: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  listNumber: 'M10 6h10 M10 12h10 M10 18h10 M4 5l1-1v4 M3.5 13.5a1.2 1.2 0 1 1 2 1L3.5 17h2.5',
  phone: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z M11 18h2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M20 20l-4-4',
  pinMap: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3 2',
  tag: 'M3 12V4h8l10 10-8 8Z M7.5 7.5h.01',
  chevronLeft: 'M15 6l-6 6 6 6',
  topbar: 'M4 4h16v16H4z M4 9h16',
  footer: 'M4 4h16v16H4z M4 15h16',
  mail: 'M4 6h16v12H4z M4 7l8 6 8-6',
  cursor: 'M5 3l14 7-6 2-2 6Z',
  click: 'M9 4v3 M4 9h3 M5.5 5.5l2 2 M11 11l9 3.5-3.8 1.7L14.5 20Z',
  pin: 'M12 16v5 M8 3h8 M9 3v6l-3 4v3h12v-3l-3-4V3',
  heading: 'M6 5v14 M18 5v14 M6 12h12',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copyright: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M15 9.5a4 4 0 1 0 0 5',
  minus: 'M5 12h14',
  x_social: 'M4 4l16 16 M20 4L4 20',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M17.5 6.5h.01',
  linkedin: 'M4 4h16v16H4z M8 10v7 M8 7v.01 M12 17v-7 M12 13a3 3 0 0 1 6 0v4',
  facebook: 'M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2Z',
  youtube: 'M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z M10 9l5 3-5 3Z',
  github: 'M9 19c-4 1.5-4-2-6-2.5 M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
}

/** Icon name for a social platform ("x" is already the close icon). */
export const socialIcon = (platform: string) => (platform === 'x' ? 'x_social' : platform)

export function Icon({ name, size = 16, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
