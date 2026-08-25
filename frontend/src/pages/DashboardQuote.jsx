import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../store/sessionsStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useStudentsStore } from '../store/studentsStore'
import { useStudentGradesStore } from '../store/studentGradesStore'
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
  const [expired, setExpired] = useState(false)

  // Which session (current/past/future) governs which row of the spec's
  // navigation table applies — only a school admin can ever have a future
  // one active (see access_scope's read gate + LeftNav hiding the option
  // from everyone else), so isFutureSession only ever matters below for them.
  const activeSession = useSessionsStore(getActiveSession)
  const isFutureSession = activeSession?.is_future ?? false
  const isPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Student/teacher/admin: "has anything been taught" — subjectsTaughtStore
  // is already scoped server-side to the caller's own role (own grade for a
  // student, whole school for staff — see teach_log_service._scope_clause),
  // so this one count means the right thing for either branch below.
  const subjectsTaughtCount = useSubjectsTaughtStore(s => s.subjects.length)
  // Admin only: whether the CURRENT session's roster is empty — deliberately
  // always the current-session count (not activeSession's), since a past
  // session is never empty-roster-gated (see the isPastSession check below)
  // and a future session's own branch never looks at this at all.
  const currentStudentCount = useStudentGradesStore(s => (s.bySession[CURRENT_SESSION_KEY] ?? []).length)
  // Parent only: how many wards (children) they have — same source LeftNav
  // reads for its own auto-select-first-ward behavior.
  const wardCount = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.students?.length ?? 0)

  useEffect(() => {
    if (hasAutoAdvanced) return
    const timer = setTimeout(() => {
      markAutoAdvanced()

      if (isSchoolAdmin) {
        // Future session: always Students (Upload Student List vs the list
        // itself is StudentsPage's own studentCount branch, not decided
        // here). Current session: Students only if the roster is empty;
        // otherwise Subjects, where SubjectsRoute/SubjectsHome already pick
        // Teach Calendar Log vs Add New Subject correctly on their own.
        // Past session: always Subjects (Teach Calendar Log), regardless of
        // roster size — matches the doc's Past Session row, which has no
        // student-count condition at all.
        if (isFutureSession || (!isPastSession && currentStudentCount === 0)) {
          navigate('/dashboard/students')
        } else {
          navigate('/dashboard/subjects')
        }
        return
      }

      if (isSchoolTeacher) {
        // SubjectsRoute/SubjectsHome already default a plain teacher to Add
        // New Subject (current session) or the Teach Calendar Log (past
        // session, see SubjectsHome's isViewingPastSession-driven initial
        // view) — this only ever needs to pick the page, not the sub-view.
        navigate('/dashboard/subjects')
        return
      }

      if (isStudent) {
        // Current or past session, doesn't matter here: StudentSubjectsHome
        // already shows the most-recently-taught subject's topics, or the
        // empty-subjects message, purely from mounting — the one thing
        // actually gated on session state is whether ANYTHING has been
        // taught at all, which decides Subjects vs staying on Quotes.
        if (subjectsTaughtCount > 0) navigate('/dashboard/subjects')
        return
      }

      if (isParent) {
        // A single ward auto-navigates (StudentSubjectsHome readOnly shows
        // that ward's topics, or the empty-subjects message, on its own);
        // zero or multiple wards stays on Quotes — LeftNav's WardPicker is
        // how a multi-ward parent actually picks one, not this timer.
        if (wardCount === 1) navigate('/dashboard/subjects')
        return
      }

      setExpired(true)
    }, LOGIN_QUOTE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [
    hasAutoAdvanced, isStudent, isSchoolTeacher, isSchoolAdmin, isParent, navigate, markAutoAdvanced,
    isFutureSession, isPastSession, subjectsTaughtCount, currentStudentCount, wardCount,
  ])

  if (expired) {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Select a page from the menu to get started.</p>
      </div>
    )
  }

  return <LoginQuote />
}
