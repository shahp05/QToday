import { apiFetch, apiErrorMessage } from '../lib/api'

export async function fetchStates(countryId) {
  const res = await apiFetch(`/states?country_id=${countryId}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json()
}
