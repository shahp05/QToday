import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useStudentGradesStore } from '../store/studentGradesStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import LoginQuote from '../components/LoginQuote'

const LOGIN_QUOTE_DURATION_MS = 5000

// The /dashboard index route — also the root of back-navigation history
// (see LeftNav/PageHeader onBack wiring). Mounts fresh every time the user
// lands on /dashboard, whether that's the initial post-login visit or the
// user backing all the way out of a page, so it always shows a fresh
// random quote either way. The auto-advance-to-default-page timer, though,
// only ever runs the first time (hasAutoAdvanced) — landing back here via
// Back means the user is choosing to sit on the quote screen, not asking
// to be bounced straight back to the page they just left.
//
// The 5s delay is also the doc's documented data-loading buffer — by the
// time it fires, Dashboard.jsx's mount-time fetches (students, subjects
// taught, sessions) have had time to resolve, which is what the role
// branches below read from.
export default function DashboardQuote() {
  const navigate         = useNavigate()
  const isStudent        = useProfileStore(s => s.is_student)
  const isSchoolTeacher  = useProfileStore(s => s.is_school_teacher)
  const isSchoolAdmin    = useProfileStore(s => s.is_school_admin)
  const isParent         = useProfileStore(s => s.is_parent)
  const hasAutoAdvanced  = useDashboardQuoteStore(s => s.hasAutoAdvanced)
  const markAutoAdvanced = useDashboardQuoteStore(s => s.markAutoAdvanced)

  // Which session (current/past/future) governs which row of the spec's
  // navigation table applies — only a school admin can ever have a future
  // one active (see access_scope's read gate + LeftNav hiding the option
  // from everyone else), so isFutureSession only ever matters below for them.
  const activeSession = useSessionsStore(getActiveSession)
  const isFutureSession = activeSession?.is_future ?? false
  const isPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Admin only: whether the CURRENT session's roster is empty — deliberately
  // always the current-session count (not activeSession's), since a past
  // session is never empty-roster-gated (see the isPastSession check below)
  // and a future session's own branch never looks at this at all.
  const currentStudentCount = useStudentGradesStore(s => (s.bySession[CURRENT_SESSION_KEY] ?? []).length)
  // Parent only: how many wards (children) they have — same source LeftNav
  // reads for its own auto-select-first-ward behavior.
  const wardCount = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.students?.length ?? 0)
  // Student/parent only: whether the selected session actually has any
  // subjects to show them — unlike teacher/admin, their Subjects page is
  // purely informational/quiz-play, so per spec they stay on Quotes
  // instead of auto-navigating to an empty page (current or past session).
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsCount = useSubjectsTaughtStore(s => s.subjects.length)
  const hasSubjectsToShow = subjectsStatus === 'loaded' && subjectsCount > 0

  useEffect(() => {
    if (hasAutoAdvanced) return
    const timer = setTimeout(() => {
      markAutoAdvanced()

      if (isSchoolAdmin) {
        // Future session: always Students (Upload Student List vs the list
        // itself is StudentsPage's own studentCount branch, not decided
        // here) — Subjects is unreachable while a future session is
        // active, per spec. Current session: Students only if the roster
        // is empty; otherwise Subjects — which now always has something to
        // show (the real form/calendar, or SubjectsRoute's own empty-state
        // message), so no further gating is needed here. Same for past
        // session.
        if (isFutureSession || (!isPastSession && currentStudentCount === 0)) {
          navigate('/dashboard/students')
        } else {
          navigate('/dashboard/subjects')
        }
        return
      }

      if (isSchoolTeacher) {
        // Subjects always has something to show now (the real teach-log UI,
        // or SubjectsRoute's own empty-state message), so unlike the admin
        // branch above there's no roster/future gating to apply here.
        navigate('/dashboard/subjects')
        return
      }

      if (isStudent) {
        // Current or past session, doesn't matter here — either way, only
        // navigate if there's actually something taught to show; otherwise
        // stay on Quotes, per spec.
        if (hasSubjectsToShow) navigate('/dashboard/subjects')
        return
      }

      if (isParent) {
        // A single ward auto-navigates to Subjects only if that ward
        // actually has something to show (same rule as a student, above);
        // zero or multiple wards, or a single ward with nothing to show,
        // stays on Quotes — LeftNav's WardPicker is how a multi-ward
        // parent actually picks one, not this timer.
        if (wardCount === 1 && hasSubjectsToShow) navigate('/dashboard/subjects')
        return
      }

      // No recognized role (shouldn't happen for a real account) — same as
      // every other "nothing to navigate to yet" case above, just keep
      // showing the quote rather than a placeholder message.
    }, LOGIN_QUOTE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [
    hasAutoAdvanced, isStudent, isSchoolTeacher, isSchoolAdmin, isParent, navigate, markAutoAdvanced,
    isFutureSession, isPastSession, currentStudentCount, wardCount, hasSubjectsToShow,
  ])

  return <LoginQuote />
}
