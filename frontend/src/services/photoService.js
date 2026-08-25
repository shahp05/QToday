import { apiFetch, apiErrorMessage } from '../lib/api'

// No Content-Type header set on either call — fetch derives the correct
// multipart/form-data boundary itself from the FormData body, which a
// manually-set header would override incorrectly.

export async function uploadMyPhoto(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiFetch('/users/me/photo', { method: 'POST', body: formData })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { photo_url }
}
