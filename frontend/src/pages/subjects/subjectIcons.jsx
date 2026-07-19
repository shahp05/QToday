// Curated per-subject icons, matched by keyword against the subject name.
// This is a client-side stand-in for the eventual DB-persisted icon_key —
// once that lands, the backend value replaces this name-matching lookup.
//
// Each icon's viewBox is cropped to its actual drawn bounds (not the full
// 0 0 24 24 canvas most stroke-icon sets use) so the glyph fills its box
// edge-to-edge — otherwise the icon's own built-in margin makes it look
// indented relative to plain text sitting next to it at the same font size.

export function IconBook() {
  return (
    <svg width="17" height="17" viewBox="3 1 18 22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

export function IconCalculator() {
  return (
    <svg width="17" height="17" viewBox="3 1 18 22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="11" x2="8" y2="11.01" />
      <line x1="12" y1="11" x2="12" y2="11.01" />
      <line x1="16" y1="11" x2="16" y2="11.01" />
      <line x1="8" y1="15" x2="8" y2="15.01" />
      <line x1="12" y1="15" x2="12" y2="15.01" />
      <line x1="16" y1="15" x2="16" y2="15.01" />
      <line x1="8" y1="19" x2="8" y2="19.01" />
      <line x1="12" y1="19" x2="12" y2="19.01" />
      <line x1="16" y1="19" x2="16" y2="19.01" />
    </svg>
  )
}

export function IconFlask() {
  return (
    <svg width="17" height="17" viewBox="3.5 1 17 21" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 8.5V2" />
      <path d="M8 2h8" />
      <path d="M7.5 14h9" />
    </svg>
  )
}

export function IconAtom() {
  return (
    <svg width="17" height="17" viewBox="1 2 22 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="1" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(120 12 12)" />
    </svg>
  )
}

export function IconDna() {
  return (
    <svg width="17" height="17" viewBox="5 2 14 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3c0 6 12 12 12 18" />
      <path d="M18 3c0 6-12 12-12 18" />
      <path d="M7.5 6h9" />
      <path d="M6.5 10h11" />
      <path d="M6.5 14h11" />
      <path d="M7.5 18h9" />
    </svg>
  )
}

export function IconGlobe() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15 15 0 0 1 0 20" />
      <path d="M12 2a15 15 0 0 0 0 20" />
    </svg>
  )
}

export function IconLandmark() {
  return (
    <svg width="17" height="17" viewBox="2 1 20 22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="22" x2="21" y2="22" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
      <polygon points="12 2 21 8 3 8" />
    </svg>
  )
}

export function IconMonitor() {
  return (
    <svg width="17" height="17" viewBox="2 3 20 18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  )
}

export function IconPalette() {
  return (
    <svg width="17" height="17" viewBox="1 1 21 22" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.3c1.9 0 3.5-1.6 3.5-3.5C21 6.4 17.2 2 12 2z" />
      <circle cx="7.5" cy="10.5" r="1.2" />
      <circle cx="11" cy="7" r="1.2" />
      <circle cx="15.5" cy="8" r="1.2" />
    </svg>
  )
}

export function IconMusic() {
  return (
    <svg width="17" height="17" viewBox="2 2 20 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

export function IconDumbbell() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="M4 9l3-3" />
      <path d="M17 20l3-3" />
      <rect x="1.5" y="12.5" width="4" height="4" rx="1" transform="rotate(-45 3.5 14.5)" />
      <rect x="18.5" y="7.5" width="4" height="4" rx="1" transform="rotate(-45 20.5 9.5)" />
    </svg>
  )
}

export function IconLeaf() {
  return (
    <svg width="17" height="17" viewBox="3 1 13 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 20A7 7 0 0 1 4 13c0-5 4-11 11-11 0 7-3 11-4 11" />
      <path d="M4 13c4 0 7 3 7 7" />
    </svg>
  )
}

export function IconCoins() {
  return (
    <svg width="17" height="17" viewBox="2 2 20 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="6" />
      <path d="M14.5 8.5A6 6 0 1 1 8.5 14.5" />
      <path d="M9 6.5v5" />
      <path d="M6.5 9h5" />
    </svg>
  )
}

export function IconBriefcase() {
  return (
    <svg width="17" height="17" viewBox="1 2 22 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )
}

export function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 2 24 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function IconBrain() {
  return (
    <svg width="17" height="17" viewBox="5 1 14 20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2c-2.2 0-4 1.8-4 4 0 .3 0 .6.1.9C6.8 7.5 6 8.9 6 10.5c0 1 .3 1.9.9 2.6-.6.7-.9 1.6-.9 2.6 0 2.2 1.8 4 4 4h1" />
      <path d="M12 2c2.2 0 4 1.8 4 4 0 .3 0 .6-.1.9 1.3.6 2.1 2 2.1 3.6 0 1-.3 1.9-.9 2.6.6.7.9 1.6.9 2.6 0 2.2-1.8 4-4 4h-1" />
      <path d="M12 2v18" />
    </svg>
  )
}

export function IconLanguage() {
  return (
    <svg width="17" height="17" viewBox="3 2 18 19" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z" />
      <path d="M8 8h8" />
      <path d="M8 11.5h5" />
    </svg>
  )
}

