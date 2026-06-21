import { useProfileStore } from '../store/profileStore'

export const API_BASE = 'http://localhost:8001/api'

/** fetch wrapper that attaches the JWT (when present) and clears the
 * profile store on a 401 so stale/expired sessions don't linger client-side. */
export async function apiFetch(path, options = {}) {
  const token = useProfileStore.getState().token
  const headers = { ...options.headers }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    useProfileStore.getState().clearProfile()
  }

  return res
}
