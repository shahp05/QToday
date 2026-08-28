import { useProfileStore } from '../store/profileStore'
import { getActiveSession, useSessionsStore } from '../store/sessionsStore'

// Whether the "Students" left-nav icon should be reachable right now, for
// a school admin or teacher — a parent's use of this same button is an
// unrelated ward-switcher (see LeftNav.jsx's isWardButton) and is never
// gated by this hook; it stays unconditionally visible for them. Per spec:
//
//   - Current or past session: always visible for both admin and teacher —
//     StudentsPage itself decides what to show (the real roster, the
//     upload screen, or an empty-state message) depending on the browsed
//     session's data.
//   - Future session: only a super-admin can ever have one active (see
//     LeftNav hiding the dropdown option from everyone else), so only
//     they ever get it here.
export function useStudentsFeatureVisible() {
  const isSchoolAdmin   = useProfileStore(s => s.is_school_admin)
  const isSchoolTeacher = useProfileStore(s => s.is_school_teacher)

  const activeSession = useSessionsStore(getActiveSession)
  const isFutureSession = activeSession?.is_future ?? false

  if (isFutureSession) return { ready: true, visible: isSchoolAdmin }
  return { ready: true, visible: isSchoolAdmin || isSchoolTeacher }
}
