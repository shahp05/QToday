import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { useProfileStore } from '../../store/profileStore'
import { useSubjectsFeatureVisible } from '../../hooks/useSubjectsFeatureVisible'
import StudentSubjectsHome from './StudentSubjectsHome'
import SubjectsHome from './SubjectsHome'

// /dashboard/subjects — same URL for every role, different content: a
// student plays quizzes here, a teacher/admin logs what they taught, and a
// parent gets the same topic-card view as a student but read-only (no
// quiz-play) for their selected ward. subjectsTaughtStore itself is kept
// fresh by Dashboard.jsx (session/ward-reactive), not fetched here, so this
// component only ever reads it.
export default function SubjectsRoute() {
  const navigate = useNavigate()
  const isStudent      = useProfileStore(s => s.is_student)
  const isParent       = useProfileStore(s => s.is_parent)
  const isSchoolAdmin  = useProfileStore(s => s.is_school_admin)

  const activeSession = useSessionsStore(getActiveSession)
  const isViewingPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Per spec, the Subjects feature is hidden (nav icon + this route) when
  // there's nothing for the current role/session/data state to show — see
  // the hook's own docstring for the full per-role matrix. Redirected away
  // here (not just left un-navigable from the nav icon) so a stale link, a
  // Back navigation, or the underlying data changing out from under an
  // already-open page all land somewhere real instead of showing an
  // enforced-empty page. Only acts once `ready` — never redirect on a
  // still-loading guess.
  const { ready, visible } = useSubjectsFeatureVisible()
  useEffect(() => {
    if (ready && !visible) navigate('/dashboard', { replace: true })
  }, [ready, visible, navigate])
  if (ready && !visible) return null

  if (isStudent) return <StudentSubjectsHome readOnly={isViewingPastSession} />
  if (isParent) return <StudentSubjectsHome readOnly />
  return (
    <SubjectsHome
      defaultView={isSchoolAdmin ? 'teachLog' : undefined}
      isViewingPastSession={isViewingPastSession}
    />
  )
}
