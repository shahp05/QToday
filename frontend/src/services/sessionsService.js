import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for academic sessions lives here, not in the
// stores/pages — this module is the only thing that knows the API shape.

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function fetchSessions() {
  const res = await apiFetch('/sessions')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { sessions, future_session, has_legacy_data }
}

export async function scheduleNextSession(startDate) {
  const res = await apiFetch('/sessions/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start_date: toISODate(startDate) }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { session_id, label, start_date, is_current }
}
