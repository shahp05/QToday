import { apiFetch, apiErrorMessage } from '../lib/api'

export async function checkLoginKey(loginKey) {
  const res = await apiFetch('/auth/reset-password/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_key: loginKey }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { user_id, is_student }
}

export async function requestResetCode(loginKey) {
  const res = await apiFetch('/auth/reset-password/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_key: loginKey }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
}

export async function verifyResetCode(loginKey, code) {
  const res = await apiFetch('/auth/reset-password/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_key: loginKey, code }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { access_token, token_type, profile } — same shape as /auth/login
}

export async function raiseStudentResetRequest(loginKey) {
  const res = await apiFetch('/auth/reset-password/raise-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_key: loginKey }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
}
