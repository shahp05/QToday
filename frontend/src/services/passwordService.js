import { apiFetch, apiErrorMessage } from '../lib/api'

export async function changeMyPassword({ currentPassword, newPassword }) {
  const res = await apiFetch('/auth/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword || null, new_password: newPassword }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // full profile
}
