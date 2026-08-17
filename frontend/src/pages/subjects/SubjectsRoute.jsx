import { useEffect } from 'react'
import { useProfileStore } from '../../store/profileStore'
import { getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import StudentSubjectsHome from './StudentSubjectsHome'
import SubjectsHome from './SubjectsHome'

// /dashboard/subjects — same URL for every role, different content: a
// student plays quizzes here, a teacher/admin logs what they taught, and a
// parent gets the same topic-card view as a student but read-only (no
// quiz-play) for their selected ward.
export default function SubjectsRoute() {
  const isStudent      = useProfileStore(s => s.is_student)
  const isParent       = useProfileStore(s => s.is_parent)
  const isSchoolAdmin  = useProfileStore(s => s.is_school_admin)

  // A parent's fetch is ward-driven (see LeftNav's ward-switch effect) —
  // this covers the session-dropdown-driven case every other role uses,
  // mirroring TeachersPage/StudentsPage's own activeSessionId effect.
  // Subjects previously had none at all: subjectsTaughtStore is a single
  // flat slot (unlike teachers/students' bySession cache), always force-
  // fetched here rather than relying on a per-session cache key to dedup —
  // switching the session dropdown was otherwise silently ignored, always
  // showing whichever session Dashboard's one-time mount fetch had loaded.
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const activeSession = useSessionsStore(getActiveSession)
  const fetchSubjectsTaught = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const isViewingPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  useEffect(() => {
    if (isParent) return
    fetchSubjectsTaught(activeSessionId, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, activeSessionId])

  if (isStudent) return <StudentSubjectsHome readOnly={isViewingPastSession} />
  if (isParent) return <StudentSubjectsHome readOnly />
  return (
    <SubjectsHome
      defaultView={isSchoolAdmin ? 'teachLog' : undefined}
      isViewingPastSession={isViewingPastSession}
    />
  )
}
