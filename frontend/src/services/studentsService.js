import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for students lives here, not in the stores.
// Stores hold/derive state; this module is the only thing that knows the
// API shape, so a backend response-shape change touches one file.

export async function fetchMyStudents() {
  const res = await apiFetch('/students/mine')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { students, student_grades, parents }
}

export async function uploadStudents(rows) {
  const res = await apiFetch('/students/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ students: rows }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // counts
}
