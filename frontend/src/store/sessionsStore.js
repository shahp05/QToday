import { create } from 'zustand'
import { fetchSessions, scheduleNextSession } from '../services/sessionsService'
import { useSubjectsTaughtStore } from './subjectsTaughtStore'

export const useSessionsStore = create((set, get) => ({
  sessions: [], // [{session_id, label, start_date, is_current}], most recent first — past + current only
  futureSession: null, // {session_id, label, start_date} | null — a pending, not-yet-live session
  hasLegacyData: false,
  status: 'idle', // idle | loading | loaded | error
  error: null,
  scheduling: false,
  scheduleError: null,

  // Which session the Students page is browsing/uploading against —
  // 'current' | 'future'.
  studentsViewTarget: 'current',

  fetchSessions: async (force = false) => {
    if (!force && (get().status === 'loaded' || get().status === 'loading')) return
    set({ status: 'loading', error: null })
    try {
      const data = await fetchSessions()
      set({
        sessions: data.sessions,
        futureSession: data.future_session,
        hasLegacyData: data.has_legacy_data,
        status: 'loaded',
        // A stale 'future' selection can't linger once there's nothing to
        // view under it (cutover happened, or nothing was ever scheduled).
        studentsViewTarget: data.future_session ? get().studentsViewTarget : 'current',
      })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  setStudentsViewTarget: (target) => set({ studentsViewTarget: target }),

  // Schedules (or reschedules) the one allowed future session. If the date
  // given is today or earlier, the backend cuts over immediately in the
  // same request — either way, refetch both the session list (to pick up
  // the new/updated future session, or the now-current one) and the
  // current-session-scoped subjects-taught tree, since an immediate
  // cutover changes what "current" resolves to.
  scheduleSession: async (startDate) => {
    set({ scheduling: true, scheduleError: null })
    try {
      await scheduleNextSession(startDate)
      await get().fetchSessions(true)
      await useSubjectsTaughtStore.getState().fetchSubjectsTaught(true)
      set({ scheduling: false })
      return true
    } catch (err) {
      set({ scheduling: false, scheduleError: err.message })
      return false
    }
  },

  clearScheduleError: () => set({ scheduleError: null }),
}))
