import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useStudentGradesStore } from '../store/studentGradesStore'
import { useSubjectsFeatureVisible } from '../hooks/useSubjectsFeatureVisible'
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

  // Shared with LeftNav's own nav-icon visibility and SubjectsRoute's
  // redirect guard — one implementation of "is there anything to show on
  // Subjects right now" for every role/session combo, per spec. `ready`
  // isn't specially handled here beyond the existing 5s data-loading
  // buffer: if the underlying fetches are unusually slow, visible falls
  // back to true (see the hook's own contract), same tradeoff every other
  // branch here already accepts.
  const { visible: subjectsVisible } = useSubjectsFeatureVisible()
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
        // here) — Subjects is unconditionally hidden while a future session
        // is active, per spec. Current session: Students only if the
        // roster is empty; otherwise Subjects, where SubjectsRoute/
        // SubjectsHome pick Teach Calendar Log vs Add New Subject on their
        // own (subjectsVisible doesn't gate on subjects taught at all for
        // the current-session admin/teacher case — only student existence
        // does, see the hook). Past session: Subjects only if the session
        // ever had anything taught (subjectsVisible); otherwise no
        // alternate destination is specified for this branch, so — same as
        // every other "hide" case below — just stay on Quotes.
        if (isFutureSession || (!isPastSession && currentStudentCount === 0)) {
          navigate('/dashboard/students')
        } else if (subjectsVisible) {
          navigate('/dashboard/subjects')
        }
        return
      }

      if (isSchoolTeacher) {
        // Current session: gated on the school having any student at all
        // (subjectsVisible's admin/teacher branch — no students means
        // nothing to teach, so stay on Quotes instead of an unusable Add
        // New Subject form). Past session: gated on the session having had
        // anything taught. SubjectsRoute/SubjectsHome pick Add New Subject
        // vs the Teach Calendar Log on their own once shown.
        if (subjectsVisible) navigate('/dashboard/subjects')
        return
      }

      if (isStudent) {
        // Current or past session, doesn't matter here: StudentSubjectsHome
        // already shows the most-recently-taught subject's topics purely
        // from mounting — the one thing actually gated on session state is
        // whether ANYTHING has been taught (current session, or retention-
        // carried from an earlier grade/session), which decides Subjects
        // vs staying on Quotes.
        if (subjectsVisible) navigate('/dashboard/subjects')
        return
      }

      if (isParent) {
        // A single ward auto-navigates only if that ward actually has
        // something to show (same current-or-retention rule as a student,
        // per spec — a parent follows the student method for their
        // selected ward); zero or multiple wards, or a single ward with
        // nothing to show, stays on Quotes — LeftNav's WardPicker is how a
        // multi-ward parent actually picks one, not this timer.
        if (wardCount === 1 && subjectsVisible) navigate('/dashboard/subjects')
        return
      }

      // No recognized role (shouldn't happen for a real account) — same as
      // every other "nothing to navigate to yet" case above, just keep
      // showing the quote rather than a placeholder message.
    }, LOGIN_QUOTE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [
    hasAutoAdvanced, isStudent, isSchoolTeacher, isSchoolAdmin, isParent, navigate, markAutoAdvanced,
    isFutureSession, isPastSession, subjectsVisible, currentStudentCount, wardCount,
  ])

  return <LoginQuote />
}
