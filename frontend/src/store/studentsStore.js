import { create } from 'zustand'
import { fetchMyStudents, uploadStudents } from '../services/studentsService'
import { CURRENT_SESSION_KEY, useSessionsStore } from './sessionsStore'
import { useStudentGradesStore } from './studentGradesStore'
import { useStudentParentsStore } from './studentParentsStore'

// The only place in the app that calls GET /students/mine — every page
// that needs a roster goes through fetchStudents() here and reads the
// resulting cache, rather than each page independently deciding whether/
// how to fetch. Distributes the response into studentGradesStore/
// studentParentsStore too, so those stay in lockstep without either of
// them fetching on their own.
//
// Cached per session (bySession[key]) so switching the site-wide session
// picker back and forth never re-fetches data already in hand. Access
// rights are enforced here, once, not by every caller: only a school
// admin's request for a specific (non-current) session is ever actually
// honored — anyone else's sessionId is silently ignored and resolves to
// current, matching what the backend independently enforces anyway (see
// routers/students.py) — this just avoids a caller needing to remember
// the rule or a doomed request ever going out.
export const useStudentsStore = create((set, get) => ({
  bySession: {}, // key -> { students: [], status, error }

  // sessionId: the real session_id to view, or null/omitted for the live
  // current session — whatever the caller has on hand (e.g. sessionsStore's
  // activeSessionId, unresolved). This function is what decides whether
  // that's actually current, normalizing to CURRENT_SESSION_KEY either way
  // so "current" only ever has one cache entry no matter how it was asked
  // for — the backend (not this client) is the actual authority on whether
  // the signed-in role is allowed to browse a non-current one.
  fetchStudents: async (sessionId = null, force = false) => {
    const requestedId = sessionId
    const currentId = useSessionsStore.getState().sessions.find(s => s.is_current)?.session_id ?? null
    const isCurrent = requestedId == null || requestedId === currentId
    const key = isCurrent ? CURRENT_SESSION_KEY : requestedId
    const apiSessionId = isCurrent ? null : requestedId

    const existing = get().bySession[key]
    if (!force && existing && (existing.status === 'loaded' || existing.status === 'loading')) return

    set(state => ({
      bySession: { ...state.bySession, [key]: { students: existing?.students ?? [], status: 'loading', error: null } },
    }))
    try {
      const data = await fetchMyStudents(apiSessionId)
      set(state => ({
        bySession: { ...state.bySession, [key]: { students: data.students, status: 'loaded', error: null } },
      }))
      useStudentGradesStore.getState().setGrades(key, data.student_grades)
      useStudentParentsStore.getState().setParents(key, data.parents)
    } catch (err) {
      set(state => ({
        bySession: { ...state.bySession, [key]: { ...state.bySession[key], status: 'error', error: err.message } },
      }))
    }
  },

  // sessionId is omitted for the ordinary case (uploads the current
  // roster); passed explicitly only when the dual-session upload selector
  // is shown (a future session is pending) and the admin picked it.
  // Uploading is always an admin-only action (the backend rejects anyone
  // else's POST), so the refresh below always legitimately requests
  // whatever session was just written to.
  uploadAndRefresh: async (rows, sessionId) => {
    const counts = await uploadStudents(rows, sessionId) // throws on failure — caller handles the error
    await get().fetchStudents(sessionId, true)
    return counts
  },

  // Patches every cached session slice that happens to include this
  // student — a photo isn't session data, so an edit made while browsing
  // one session must still be reflected if the same student also appears
  // in another already-cached slice (e.g. the live current roster).
  updateStudentPhoto: (studentId, photoUrl) => {
    set(state => ({
      bySession: Object.fromEntries(
        Object.entries(state.bySession).map(([key, slice]) => [
          key,
          { ...slice, students: slice.students.map(s => s.student_id === studentId ? { ...s, photo_url: photoUrl } : s) },
        ])
      ),
    }))
  },

  clearStudents: () => {
    set({ bySession: {} })
    useStudentGradesStore.getState().clearGrades()
    useStudentParentsStore.getState().clearParents()
  },
}))
