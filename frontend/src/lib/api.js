import { useProfileStore } from '../store/profileStore'
import { ErrorCode, ERROR_DEFAULTS } from '../errors/errorCodes'

export const API_BASE = 'http://localhost:8001/api'

/** fetch wrapper that attaches the JWT (when present), aborts a request that
 * hangs longer than timeoutMs (default 20s — bump this per-call for routes
 * expected to run long, e.g. LLM generation), and clears the profile store
 * on a 401 so stale/expired sessions don't linger client-side. */
export async function apiFetch(path, options = {}) {
  const { timeoutMs = 20000, ...fetchOptions } = options
  const token = useProfileStore.getState().token
  const headers = { ...fetchOptions.headers }
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers, signal: controller.signal })
  } catch (err) {
    // A client-side timeout rejects with a DOMException named "AbortError",
    // not a TypeError — normalize it to a TypeError so every call site's
    // existing `err instanceof TypeError` check (network failure) handles a
    // hung request the same way, without each one needing its own
    // AbortError case.
    if (err.name === 'AbortError') throw new TypeError('Request timed out', { cause: err })
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401) {
    useProfileStore.getState().clearProfile()
  }

  return res
}

/** Resolves a backend error response body ({ error_code, context }) to
 * display text via the shared errorCodes.ts registry — generated from the
 * same error_codes.json the backend uses, so neither side hardcodes
 * wording. {placeholder} tokens in the message are filled from context
 * (e.g. the offending id). Falls back to UNKNOWN_ERROR for a missing/
 * unrecognized code (network failure, non-JSON body, etc). */
export function resolveApiError(body) {
  const def = ERROR_DEFAULTS[body?.error_code] ?? ERROR_DEFAULTS[ErrorCode.UNKNOWN_ERROR]
  const context = body?.context ?? {}
  return def.message.replace(/\{(\w+)\}/g, (match, key) => key in context ? context[key] : match)
}

/** Parses an !res.ok response body and resolves it to display text —
 * the one place every service file should go through instead of reading
 * res.json() / body.detail directly. */
export async function apiErrorMessage(res) {
  const body = await res.json().catch(() => null)
  return resolveApiError(body)
}
