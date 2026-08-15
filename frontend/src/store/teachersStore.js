import { create } from 'zustand'
import { fetchMyTeachers, setTeacherSuperAdmin, uploadTeachers } from '../services/teachersService'
import { useParentWardStore } from './parentWardStore'
import { useProfileStore } from './profileStore'
import { CURRENT_SESSION_KEY, useSessionsStore } from './sessionsStore'

// The only place in the app that calls GET /teachers/mine — mirrors
// studentsStore.js's shape/reasoning exactly: cached per session
// (bySession[key]) so switching the site-wide session picker never
// re-fetches data already in hand. Access rights for a non-current
// session are enforced backend-side (any role may browse one — see
// resolve_session_browsing_customer_id) — this client doesn't re-guess it.
//
// A parent has no customer_id of their own, so every fetch here resolves
// their currently selected ward (parentWardStore) and sends it as
// student_id — there's only ever one ward "active" at a time, so the cache
// itself stays keyed by session alone (not ward too); LeftNav clears it
// whenever the selected ward changes instead, which is simpler than
// threading a second cache dimension through every key here.
export const useTeachersStore = create((set, get) => ({
  bySession: {}, // key -> { teachers: [], status, error }

  fetchTeachers: async (sessionId = null, force = false) => {
    const isParent = useProfileStore.getState().is_parent
    const wardId = isParent ? useParentWardStore.getState().selectedStudentId : null
    if (isParent && wardId == null) return // no ward selected/loaded yet — nothing to fetch

    const requestedId = sessionId
    const currentId = useSessionsStore.getState().sessions.find(s => s.is_current)?.session_id ?? null
    const isCurrent = requestedId == null || requestedId === currentId
    const key = isCurrent ? CURRENT_SESSION_KEY : requestedId
    const apiSessionId = isCurrent ? null : requestedId

    const existing = get().bySession[key]
    if (!force && existing && (existing.status === 'loaded' || existing.status === 'loading')) return

    set(state => ({
      bySession: { ...state.bySession, [key]: { teachers: existing?.teachers ?? [], status: 'loading', error: null } },
    }))
    try {
      const data = await fetchMyTeachers(apiSessionId, wardId)
      set(state => ({
        bySession: { ...state.bySession, [key]: { teachers: data.teachers, status: 'loaded', error: null } },
      }))
    } catch (err) {
      set(state => ({
        bySession: { ...state.bySession, [key]: { ...state.bySession[key], status: 'error', error: err.message } },
      }))
    }
  },

  // sessionId is omitted for the ordinary case (uploads the current
  // roster); passed explicitly only when targeting the pending future
  // session (staged new hires — see teachers_upload_service.py, additive
  // only, never a past session). Uploading is always admin-only, so the
  // refresh below always legitimately requests whatever was just written.
  uploadAndRefresh: async (rows, sessionId) => {
    const counts = await uploadTeachers(rows, sessionId) // throws on failure — caller handles the error
    await get().fetchTeachers(sessionId, true)
    return counts
  },

  // Super-admin status is a live/current-only concept (see the permission
  // matrix design — "who's the school's super admin right now" isn't
  // something a past session's view should be able to change), so this
  // only ever touches the current slice.
  setSuperAdmin: async (orgId, isSuperAdmin) => {
    const result = await setTeacherSuperAdmin(orgId, isSuperAdmin) // throws on failure — caller handles the error
    set(state => {
      const current = state.bySession[CURRENT_SESSION_KEY]
      if (!current) return state
      return {
        bySession: {
          ...state.bySession,
          [CURRENT_SESSION_KEY]: {
            ...current,
            teachers: current.teachers.map(t =>
              t.org_id === result.org_id ? { ...t, is_super_admin: result.is_super_admin } : t
            ),
          },
        },
      }
    })
  },

  // Patches every cached session slice that happens to include this
  // teacher — a photo isn't session data, same reasoning as
  // studentsStore.updateStudentPhoto.
  updateTeacherPhoto: (userId, photoUrl) => {
    set(state => ({
      bySession: Object.fromEntries(
        Object.entries(state.bySession).map(([key, slice]) => [
          key,
          { ...slice, teachers: slice.teachers.map(t => t.user_id === userId ? { ...t, photo_url: photoUrl } : t) },
        ])
      ),
    }))
  },

  clearTeachers: () => set({ bySession: {} }),
}))
