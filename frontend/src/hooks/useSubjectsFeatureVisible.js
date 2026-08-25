import { useProfileStore } from '../store/profileStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useStudentGradesStore } from '../store/studentGradesStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useParentWardStore } from '../store/parentWardStore'

// Whether the "Subjects" feature (left-nav icon + the /dashboard/subjects
// route itself) should be reachable right now — re-evaluated live as the
// session picker, roster, or taught-subjects data changes, not just once
// at login. Per spec's navigation matrix:
//
// Current session:
//   Teacher/Super-User — visible iff the school has any active student
//     (in the CURRENT session specifically, regardless of which session
//     is being browsed — same signal StudentsPage's own "no roster yet"
//     gate already uses). Subjects existing or not doesn't matter here;
//     once there's a student to teach, the page shows either the Teach
//     Calendar Log or the Add New Subject form on its own.
//   Student/Parent — visible iff subjectsTaughtStore has anything at all
//     (already the current-session-plus-retention-range merge — see
//     teach_log_service._learner_subjects_taught).
// Past session:
//   Every role — visible iff subjectsTaughtStore (already re-fetched
//     scoped to whichever past session is active — see Dashboard.jsx)
//     has anything: for staff, anything ever taught that session; for a
//     student/parent, anything taught then plus retention carried into
//     their grade as of THAT session.
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
  const isStudent       = useProfileStore(s => s.is_student)
  const isParent        = useProfileStore(s => s.is_parent)

  const activeSession = useSessionsStore(getActiveSession)
  const isFutureSession = activeSession?.is_future ?? false
  const isPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsCount  = useSubjectsTaughtStore(s => s.subjects.length)
  // studentsStatus (the fetch orchestrator) and the actual count come from
  // two different stores — studentGradesStore has no status of its own,
  // it's only ever populated as a side effect of studentsStore.
  // fetchStudents() — same split StudentsPage.jsx itself relies on for its
  // "does the current session have anyone in it" gate.
  const studentsStatus = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  const currentStudentCount = useStudentGradesStore(s => (s.bySession[CURRENT_SESSION_KEY] ?? []).length)
  const wardId = useParentWardStore(s => s.selectedStudentId)

  if (isSchoolAdmin || isSchoolTeacher) {
    if (isFutureSession) return { ready: true, visible: false }
    if (!isPastSession) {
      if (studentsStatus !== 'loaded') return { ready: false, visible: true }
      return { ready: true, visible: currentStudentCount > 0 }
    }
    if (subjectsStatus !== 'loaded') return { ready: false, visible: true }
    return { ready: true, visible: subjectsCount > 0 }
  }

  if (isStudent) {
    if (subjectsStatus !== 'loaded') return { ready: false, visible: true }
    return { ready: true, visible: subjectsCount > 0 }
  }

  if (isParent) {
    if (wardId == null) return { ready: false, visible: true }
    if (subjectsStatus !== 'loaded') return { ready: false, visible: true }
    return { ready: true, visible: subjectsCount > 0 }
  }

  return { ready: true, visible: true }
}
