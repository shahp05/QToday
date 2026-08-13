import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for teachers lives here, not in the stores —
// mirrors studentsService.js.

// sessionId is admin-only — browsing a specific (current, future, or past)
// session's teachers. Omitted for the ordinary "my own current roster" case
// used everywhere else in the app.
export async function fetchMyTeachers(sessionId) {
  const qs = sessionId != null ? `?session_id=${sessionId}` : ''
  const res = await apiFetch(`/teachers/mine${qs}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { teachers }
}

export async function uploadTeachers(rows, sessionId) {
  const res = await apiFetch('/teachers/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teachers: rows, session_id: sessionId ?? null }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // counts
}

export async function setTeacherSuperAdmin(orgId, isSuperAdmin) {
  const res = await apiFetch(`/teachers/${encodeURIComponent(orgId)}/super-admin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_super_admin: isSuperAdmin }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { org_id, is_super_admin }
}
