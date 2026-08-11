const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// "10 Aug 2026" — matches backend session_service.py's _format_label
// (day, short month name, full year), used everywhere a session date is
// displayed.
export function formatDate(d) {
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`
}
