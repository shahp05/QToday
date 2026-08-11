import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for students lives here, not in the stores.
// Stores hold/derive state; this module is the only thing that knows the
// API shape, so a backend response-shape change touches one file.

// sessionId is admin-only — browsing a specific (possibly future) session's
// roster. Omitted for the ordinary "my own current roster" case used
// everywhere else in the app.
export async function fetchMyStudents(sessionId) {
  const qs = sessionId != null ? `?session_id=${sessionId}` : ''
  const res = await apiFetch(`/students/mine${qs}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { students, student_grades, parents }
}

export async function uploadStudents(rows, sessionId) {
  const res = await apiFetch('/students/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ students: rows, session_id: sessionId ?? null }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // counts
}
