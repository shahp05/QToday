import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for teachers lives here, not in the stores —
// mirrors studentsService.js.

export async function fetchMyTeachers() {
  const res = await apiFetch('/teachers/mine')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { teachers }
}

export async function uploadTeachers(rows) {
  const res = await apiFetch('/teachers/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teachers: rows }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // counts
}
