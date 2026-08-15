import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for teachers lives here, not in the stores —
// mirrors studentsService.js.

// sessionId browses a specific (current, future, or past) session's
// teachers, open to every role. studentId is a parent's selected ward — a
// parent has no customer_id of their own (their wards can be at different
// schools), so the backend resolves "which school" from it instead; every
// other role omits it.
export async function fetchMyTeachers(sessionId, studentId) {
  const params = new URLSearchParams()
  if (sessionId != null) params.set('session_id', sessionId)
  if (studentId != null) params.set('student_id', studentId)
  const qs = params.toString()
  const res = await apiFetch(`/teachers/mine${qs ? `?${qs}` : ''}`)
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
