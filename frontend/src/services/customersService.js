import { apiFetch, apiErrorMessage } from '../lib/api'

export async function fetchMyCustomer() {
  const res = await apiFetch('/customers/me')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json()
}

export async function updateMyCustomer(payload) {
  const res = await apiFetch('/customers/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json()
}
