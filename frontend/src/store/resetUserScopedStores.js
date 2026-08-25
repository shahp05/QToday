import { useStudentsStore } from './studentsStore'
import { useTeachersStore } from './teachersStore'
import { useSubjectsTaughtStore } from './subjectsTaughtStore'
import { useQuizProgressStore } from './quizProgressStore'
import { useQuizHistoryStore } from './quizHistoryStore'
import { useClassQuizProgressStore } from './classQuizProgressStore'
import { useSessionsStore } from './sessionsStore'
import { useParentWardStore } from './parentWardStore'
import { useStudentsListFilterStore } from './studentsListFilterStore'

// Wipes every per-user/per-session data cache EXCEPT profileStore and
// dashboardQuoteStore, which each caller handles itself (an explicit
// logout clears profile directly; a fresh login is about to overwrite it
// via setProfile anyway). Most of these stores persist nothing (in-memory
// only), but sessionsStore's activeSessionId is deliberately
// localStorage-backed (so a page refresh doesn't lose a manually browsed
// session) — that persistence is exactly what let a PAST session
// selection survive past its own login and silently become the default
// for a later one.
//
// Shared by LeftNav's explicit Logout AND LoginPage's successful-login
// handler, because logout is not the only way a user ends up back at the
// login screen — apiFetch's 401 handler (lib/api.js) also drops the user
// back to login on an expired token, but only ever clears profileStore,
// not this data. Calling this again right after every successful login —
// not just relying on whichever earlier logout path fired — guarantees a
// clean slate (including "current session is the default") regardless of
// how the previous session ended, without needing to chase down every
// place a user can be signed out.
export function resetUserScopedStores() {
  useStudentsStore.getState().clearStudents()
  useTeachersStore.getState().clearTeachers()
  useSubjectsTaughtStore.getState().clearSubjectsTaught()
  useQuizProgressStore.getState().clearQuizProgress()
  useQuizHistoryStore.getState().clearQuizHistory()
  useClassQuizProgressStore.getState().clearClassProgress()
  useSessionsStore.getState().clearSessions()
  useParentWardStore.getState().clear()
  useStudentsListFilterStore.getState().clear()
}
