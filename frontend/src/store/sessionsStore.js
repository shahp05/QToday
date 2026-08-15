import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { fetchSessions, scheduleNextSession } from '../services/sessionsService'
import { useSubjectsTaughtStore } from './subjectsTaughtStore'

// Cache key every session-cached store (students, and eventually teachers/
// subjects — see getActiveSessionKey below) uses for "the customer's live
// current session". Stable across a cutover — when a new session becomes
// current, this key's meaning shifts with it — rather than tied to
// whichever session_id happens to be current at any given moment. Lets
// every store share one cache slot for "current" regardless of how a
// caller asked for it (omitted sessionId, explicit null, or the current
// session's own literal id all resolve here).
export const CURRENT_SESSION_KEY = 'current'

export const useSessionsStore = create(
  persist(
    (set, get) => ({
      // Every one of this customer's sessions — past, current, and the one
      // allowed future session — merged into a single list, most recent
      // start_date first (current sorts wherever its date puts it; future
      // is always the newest by definition). Each row carries is_current/
      // is_future (a row is "past" iff neither is true) plus start_date/
      // label, so the dropdown can render and order correctly without a
      // second lookup.
      sessions: [],
      hasLegacyData: false,
      status: 'idle', // idle | loading | loaded | error
      error: null,
      scheduling: false,
      scheduleError: null,

      // The real session_id every session-aware page is browsing/
      // uploading/logging against, site-wide — null only before sessions
      // have ever loaded. Persisted (see the persist() config below) so a
      // refresh doesn't silently drop the user back onto the current
      // session without telling them.
      activeSessionId: null,

      // studentId is a parent's selected ward (see parentWardStore) — a
      // parent has no customer_id of their own, so the backend resolves
      // "which school's sessions" from it instead. Every other role omits
      // it (their own customer_id is used server-side).
      fetchSessions: async (studentId = null, force = false) => {
        if (!force && (get().status === 'loaded' || get().status === 'loading')) return
        set({ status: 'loading', error: null })
        try {
          const data = await fetchSessions(studentId)
          const sessions = [
            ...data.sessions.map(s => ({ ...s, is_future: false })),
            ...(data.future_session ? [{ ...data.future_session, is_current: false, is_future: true }] : []),
          ]
          const persisted = get().activeSessionId
          const stillValid = persisted != null && sessions.some(s => s.session_id === persisted)
          const current = sessions.find(s => s.is_current)
          set({
            sessions,
            hasLegacyData: data.has_legacy_data,
            status: 'loaded',
            // A persisted selection can't linger once there's nothing left
            // for it to point at (cutover happened, nothing was ever
            // scheduled, or a past session no longer exists) — falls back
            // to current, the documented default on login, only then.
            activeSessionId: stillValid ? persisted : (current?.session_id ?? null),
          })
        } catch (err) {
          set({ status: 'error', error: err.message })
        }
      },

      setActiveSessionId: (sessionId) => set({ activeSessionId: sessionId }),

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
          // Only a sys admin can ever schedule a session — never a parent
          // (they have no session-creation UI at all), so no studentId here.
          await get().fetchSessions(null, true)
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
      // stale selection, from whoever was signed in before.
      clearSessions: () => set({
        sessions: [], hasLegacyData: false, status: 'idle', error: null, activeSessionId: null,
      }),
    }),
    {
      name: 'qtoday-session-target',
      // Only the user's own selection needs to survive a refresh — the
      // fetched session list/status should always come fresh from the
      // server, never stale localStorage data.
      partialize: (state) => ({ activeSessionId: state.activeSessionId }),
    }
  )
)

// The currently active session's own record (is_current/is_future/
// start_date/label), or null before sessions have loaded or once a
// persisted selection has gone stale.
export function getActiveSession(state) {
  return state.sessions.find(s => s.session_id === state.activeSessionId) ?? null
}

// The cache key every session-cached store should read/write for
// whatever's currently active — CURRENT_SESSION_KEY for the live session,
// the real session_id for a past or future one. This is the one place
// that knows how to translate "which session is selected" into "which
// cache slot that means" — every store built on this pattern imports it
// instead of re-deriving is_current itself.
export function getActiveSessionKey(state) {
  const active = getActiveSession(state)
  return active?.is_current ? CURRENT_SESSION_KEY : state.activeSessionId
}
