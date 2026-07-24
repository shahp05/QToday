// Shared green/amber/red scheme for any score or percentage shown to a
// student — same three colors the sidebar gradient and buttons already use
// (LeftNav.css), not the dark green reserved for the page background.
// Confirmed thresholds: >=75% green, 40-75% amber, <40% red.
export function scoreColor(pct) {
  if (pct >= 75) return 'var(--color-green-light)'
  if (pct >= 40) return 'var(--color-yellow)'
  return 'var(--color-red)'
}

// Text color to pair with scoreColor()'s background. --color-green-light is
// a light lime (#8EEB65) — white text on it reads poorly, so it gets dark
// text like every other green-light button/pill in the app; red and amber
// are dark enough that white text stays readable.
export function scoreTextColor(pct) {
  return pct >= 75 ? 'var(--color-dark)' : 'var(--color-white)'
}
