import { useProfileStore } from '../store/profileStore'
import { getActiveSession, useSessionsStore } from '../store/sessionsStore'
import { useParentWardStore } from '../store/parentWardStore'

// Whether the "Subjects" feature (left-nav icon + the /dashboard/subjects
// route itself) should be reachable right now — re-evaluated live as the
// session picker changes, not just once at login. Per spec's navigation
// matrix:
//
// Current or past session: always visible for every role — SubjectsRoute
//   itself decides what to show (the real teach-log/quiz UI, or an
//   empty-state message when there's nothing yet — no students, nothing
//   logged/taught) rather than this hook hiding the feature outright.
// Future session: only a Super-User can ever have one active (everyone
//   else is blocked from reading it at all) — always hidden; the
//   Students page is what's shown instead.
//
// Returns { ready, visible }. ready=false means the data this decision
// depends on hasn't loaded yet — callers should treat that as "don't
// decide yet" (visible defaults to true in that case, so e.g. the left
// nav icon doesn't flash hidden-then-shown while data is still loading).
export function useSubjectsFeatureVisible() {
  const isSchoolAdmin   = useProfileStore(s => s.is_school_admin)
  const isSchoolTeacher = useProfileStore(s => s.is_school_teacher)
  const isParent        = useProfileStore(s => s.is_parent)

  const activeSession = useSessionsStore(getActiveSession)
  const isFutureSession = activeSession?.is_future ?? false

  const wardId = useParentWardStore(s => s.selectedStudentId)

  if (isSchoolAdmin || isSchoolTeacher) {
    return { ready: true, visible: !isFutureSession }
  }

  if (isParent) {
    if (wardId == null) return { ready: false, visible: true }
    return { ready: true, visible: true }
  }

  return { ready: true, visible: true }
}
