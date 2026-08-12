import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchSessions, scheduleNextSession } from '../services/sessionsService'
import { useSubjectsTaughtStore } from './subjectsTaughtStore'

export const useSessionsStore = create(
  persist(
    (set, get) => ({
      sessions: [], // [{session_id, label, start_date, is_current}], most recent first — past + current only
      futureSession: null, // {session_id, label, start_date} | null — a pending, not-yet-live session
      hasLegacyData: false,
      status: 'idle', // idle | loading | loaded | error
      error: null,
      scheduling: false,
      scheduleError: null,

      // Which session every session-aware page (Students, and eventually
      // Teachers/Subjects) is browsing/uploading/logging against — 'current'
      // | 'future' for now (past-session browsing is a later step: it needs
      // a relaxed, read-only session validator on the backend before any
      // page can safely accept a past session_id here). Site-wide on
      // purpose, not Students-page-local — a single selection is what makes
      // "was this upload meant for the current or the new session?"
      // unambiguous across every page. Persisted (see the persist() config
      // below) so a refresh doesn't silently drop the user back onto the
      // current session without telling them.
      activeSessionTarget: 'current',

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
            // A persisted 'future' selection can't linger once there's
            // nothing to view under it (cutover happened, or nothing was
            // ever scheduled) — falls back to 'current' only in that case.
            activeSessionTarget: data.future_session ? get().activeSessionTarget : 'current',
          })
        } catch (err) {
          set({ status: 'error', error: err.message })
        }
      },

      setActiveSessionTarget: (target) => set({ activeSessionTarget: target }),

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

      // Called on logout — a different customer signing in on the same
      // browser must never inherit a stale fetched session list, or a
      // stale 'future' selection, from whoever was signed in before.
      clearSessions: () => set({
        sessions: [], futureSession: null, hasLegacyData: false,
        status: 'idle', error: null, activeSessionTarget: 'current',
      }),
    }),
    {
      name: 'qtoday-session-target',
      // Only the user's own selection needs to survive a refresh — the
      // fetched session list/status should always come fresh from the
      // server, never stale localStorage data.
      partialize: (state) => ({ activeSessionTarget: state.activeSessionTarget }),
    }
  )
)
