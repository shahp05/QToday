// Shared green/amber/red scheme for any score or percentage shown to a
// student — same three colors the sidebar gradient and buttons already use
// (LeftNav.css), not the dark green reserved for the page background.
// Confirmed thresholds: >=75% green, 40-75% amber, <40% red.
export function scoreColor(pct) {
  if (pct >= 75) return 'var(--color-green-light)'
  if (pct >= 40) return 'var(--color-yellow)'
  return 'var(--color-red)'
}
