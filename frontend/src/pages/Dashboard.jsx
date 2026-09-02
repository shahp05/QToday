import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import LeftNav from '../components/LeftNav'
import { useProfileStore } from '../store/profileStore'
import { useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useTopicCatalogStore } from '../store/topicCatalogStore'
import { useQuizHistoryStore } from '../store/quizHistoryStore'
import { Toast } from '../components/ui/Toast'
import './Dashboard.css'

// Layout for everything under /dashboard: left icon nav + whichever child
// route is active. Which page shows (quote / students / teachers / subjects
// / a student's detail) is now driven entirely by the URL — see App.jsx —
// so real back-navigation is just the browser's own history.
export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useProfileStore(s => s.token)
  const isParent = useProfileStore(s => s.is_parent)
  const isStudent = useProfileStore(s => s.is_student)
  const isDefaultPassword = useProfileStore(s => s.is_default_password)
  const fetchStudents       = useStudentsStore(s => s.fetchStudents)
  const fetchTeachers       = useTeachersStore(s => s.fetchTeachers)
  const fetchSubjectsTaught = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const fetchTopicCatalog   = useTopicCatalogStore(s => s.fetchTopicCatalog)
  // LeftNav's session dropdown needs this regardless of which page the user
  // lands on first — fetched here (not lazily inside whichever page used
  // to trigger it) so it's never missing just because Students wasn't the
  // first page visited this session.
  const fetchSessions       = useSessionsStore(s => s.fetchSessions)
  const activeSessionId     = useSessionsStore(s => s.activeSessionId)

  // Initial data load — intentionally mount-only. Runs on every /dashboard
  // mount, including a refresh — unlike the quote screen's auto-advance
  // flag (see dashboardQuoteStore), which is deliberately NOT reset here,
  // since a refresh must not re-arm it.
  useEffect(() => {
    fetchStudents()
    fetchTeachers()
    fetchTopicCatalog()
    fetchSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Default-password nudge — mount-only (Dashboard stays mounted across
  // /dashboard/* sub-navigation, only remounting on a fresh login or a
  // full-page refresh, so this naturally fires once per session rather
  // than needing its own "already shown" flag). Per Account Rules: a
  // super-admin/teacher/parent is nudged as soon as their password is
  // still the default; a student only once they've actually played a
  // quiz — quizHistoryStore isn't otherwise populated this early (only
  // StudentSubjectsHome loads it), so it's fetched here just to check.
  const [showPasswordToast, setShowPasswordToast] = useState(false)
  useEffect(() => {
    if (!isDefaultPassword) return
    if (!isStudent) {
      setShowPasswordToast(true)
      return
    }
    let cancelled = false
    useQuizHistoryStore.getState().fetchQuizHistory().then(() => {
      if (!cancelled && useQuizHistoryStore.getState().quizzes.length > 0) setShowPasswordToast(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // subjectsTaughtStore kept in sync with whichever session is active, for
  // every role except a parent (ward-driven instead — see LeftNav's
  // ward-switch effect). Lives here rather than SubjectsRoute so
  // useSubjectsFeatureVisible (the left nav's own Subjects-visibility
  // decision) always has fresh data regardless of which page is actually
  // showing, not just while the Subjects page itself is mounted. A single
  // flat slot, not session-cached, so this force-refetches on every
  // activeSessionId change rather than relying on a cache key to dedup.
  useEffect(() => {
    if (isParent) return
    fetchSubjectsTaught(activeSessionId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, activeSessionId])

  // studentsStore kept in sync with whichever session is active too, for
  // the same reason as subjectsTaughtStore above — useStudentsFeatureVisible
  // (the left nav's own Students-visibility decision) needs fresh roster
  // data for whatever session is selected regardless of which page is
  // actually showing, not just while the Students page itself is mounted.
  // Unlike subjectsTaughtStore's flat slot, this one is already cached
  // per-session (bySession[key] — see studentsStore.js), so no force is
  // needed: switching back to an already-fetched session is a no-op.
  // Skipped for a parent — their wards come from the unconditional mount
  // fetch above, keyed by ward via LeftNav's own ward-switch effect, not
  // by this site-wide session picker.
  useEffect(() => {
    if (isParent) return
    fetchStudents(activeSessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, activeSessionId])

  // teachersStore kept in sync with whichever session is active too, same
  // reasoning as studentsStore above — TeachersPage/TeachersList need
  // fresh data for whatever session is selected regardless of which page
  // is actually showing. Also already cached per-session, so no force
  // needed. Skipped for a parent for the same reason as studentsStore —
  // their view is ward-driven (LeftNav's own ward-switch effect), not
  // by this site-wide session picker.
  useEffect(() => {
    if (isParent) return
    fetchTeachers(activeSessionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, activeSessionId])

  // No route guard previously existed anywhere above /dashboard/* — a
  // cleared/expired profile (logout, apiFetch's 401 handler) left this
  // whole layout reachable with nothing but empty data, instead of
  // bouncing back to the Home/Login screen. Checked after every hook above
  // (never before one), per React's rules.
  if (!token) return <Navigate to="/" replace />

  // Suppressed while already on the Account page (there's nothing to click
  // through to) and once the password's actually changed — isDefaultPassword
  // is a live profileStore value, so this clears itself the moment
  // ChangePasswordSection's applyPasswordChange flips it, no extra wiring
  // needed beyond reading it here alongside showPasswordToast.
  const isOnAccountPage = location.pathname === '/dashboard/account'
  const passwordToastMessage = showPasswordToast && isDefaultPassword && !isOnAccountPage
    ? 'Change your default password now'
    : ''

  return (
    <div className="dashboard">
      <LeftNav />
      <div className="dashboard-panel3">
        <Outlet />
      </div>
      <Toast
        message={passwordToastMessage}
        variant="action"
        duration={null}
        onDismiss={() => setShowPasswordToast(false)}
        onClick={() => navigate('/dashboard/account', { state: { tab: 'changePassword' } })}
      />
    </div>
  )
}
