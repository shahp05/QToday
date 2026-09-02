import { apiFetch, apiErrorMessage } from '../lib/api'

export async function fetchResetRequests() {
  const res = await apiFetch('/reset-requests')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  const { requests } = await res.json()
  return requests
}

export async function approveResetRequest(requestId) {
  const res = await apiFetch(`/reset-requests/${requestId}/approve`, { method: 'POST' })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
}
