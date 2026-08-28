import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { useProfileStore } from '../../store/profileStore'
import { useParentWardStore } from '../../store/parentWardStore'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useSubjectsFeatureVisible } from '../../hooks/useSubjectsFeatureVisible'
import EmptyFeatureState from '../../components/EmptyFeatureState'
import StudentSubjectsHome from './StudentSubjectsHome'
import SubjectsHome from './SubjectsHome'

// Same path/fill as LeftNav's IconSubjects, just rendered larger for the
// empty-state message (see IconQuote/LoginQuote for the same pattern).
function IconSubjectsLarge() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
    </svg>
  )
}

// Per doc section 1.3.4.1 (Subjects Page).
const TEACHER_NO_STUDENTS_MESSAGE =
  'Your super-admin has not uploaded the list of students for this academic session yet. Log the subjects you teach once it is done.'
const ADMIN_NO_STUDENTS_MESSAGE =
  'You have not uploaded the list of students for this academic session. Teachers will be able to log their subjects after that.'
const STAFF_PAST_MESSAGE = 'No subjects were logged in this academic session.'
const STUDENT_CURRENT_MESSAGE =
  'Target to stay in green on the subjects taught in school. Your teachers have not logged any subject for you to play quizzes on.'
const STUDENT_PAST_MESSAGE =
  'It seems no subjects were logged here by teachers for this academic session. Practice what you are taught in your current grade.'
const PARENT_CURRENT_MESSAGE =
  'No subjects have been logged by teachers yet. Encourage your ward to practice all the topics when they are taught and logged by teachers.'
const PARENT_PAST_MESSAGE =
  'It seems no subjects were logged here by teachers for this academic session, so no quizzes were played by your ward either.'

// /dashboard/subjects — same URL for every role, different content: a
// student plays quizzes here, a teacher/admin logs what they taught, and a
// parent gets the same topic-card view as a student but read-only (no
// quiz-play) for their selected ward. subjectsTaughtStore itself is kept
// fresh by Dashboard.jsx (session/ward-reactive), not fetched here, so this
// component only ever reads it.
export default function SubjectsRoute() {
  const navigate = useNavigate()
  const isStudent       = useProfileStore(s => s.is_student)
  const isParent        = useProfileStore(s => s.is_parent)
  const isSchoolAdmin   = useProfileStore(s => s.is_school_admin)
  const isSchoolTeacher = useProfileStore(s => s.is_school_teacher)
  const wardId          = useParentWardStore(s => s.selectedStudentId)

  const activeSession = useSessionsStore(getActiveSession)
  const isViewingPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Only genuinely hidden (nav icon + this route) for a future session and
  // a parent with no ward selected yet — see the hook's own docstring.
  // Every other "nothing to show" case is decided below instead, by this
  // component. Redirected away here (not just left un-navigable from the
  // nav icon) so a stale link, a Back navigation, or the session changing
  // out from under an already-open page all land somewhere real. Only acts
  // once `ready` — never redirect on a still-loading guess.
  const { ready, visible } = useSubjectsFeatureVisible()

  // Current-session empty states. Clicking into Subjects never redirects
  // to Students, even for an admin with no roster yet — that would be a
  // surprising jump away from the page just clicked; the empty message
  // is what shows instead, same as every other role. Gated on each store's
  // own status, not just the count being 0 — a count that hasn't loaded
  // yet reads as 0 too, and deciding "confirmed empty" off that would
  // flash the empty message before real data arrives.
  const studentsStatus = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  const currentStudentCount = useStudentGradesStore(s => (s.bySession[CURRENT_SESSION_KEY] ?? []).length)
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsCount = useSubjectsTaughtStore(s => s.subjects.length)
  // isSchoolAdmin implies isSchoolTeacher too (a super-admin's claims are
  // always both — see profile_service.get_profile), so this alone already
  // covers both roles; the message picked below is what actually differs.
  const noCurrentStudents = isSchoolTeacher && !isViewingPastSession &&
    studentsStatus === 'loaded' && currentStudentCount === 0
  const showEmptyForLearner = (isStudent || isParent) && !isViewingPastSession &&
    subjectsStatus === 'loaded' && subjectsCount === 0
  // Past session, nothing logged/taught then — every role (including a
  // school admin, who'd otherwise default to the Teach Calendar Log) gets
  // the same empty message instead; there's no upload-roster escape hatch
  // for history the way there is for an empty current session.
  const pastSessionEmpty = isViewingPastSession && subjectsStatus === 'loaded' && subjectsCount === 0

  const emptyMessage = noCurrentStudents ? (isSchoolAdmin ? ADMIN_NO_STUDENTS_MESSAGE : TEACHER_NO_STUDENTS_MESSAGE)
    : pastSessionEmpty ? (isStudent ? STUDENT_PAST_MESSAGE : isParent ? PARENT_PAST_MESSAGE : STAFF_PAST_MESSAGE)
    : showEmptyForLearner ? (isStudent ? STUDENT_CURRENT_MESSAGE : PARENT_CURRENT_MESSAGE)
    : null

  useEffect(() => {
    if (ready && !visible) navigate('/dashboard', { replace: true })
  }, [ready, visible, navigate])

  if (ready && !visible) return null

  if (emptyMessage) {
    return <EmptyFeatureState icon={<IconSubjectsLarge />} message={emptyMessage} />
  }

  if (isStudent) return <StudentSubjectsHome readOnly={isViewingPastSession} />
  if (isParent) return <StudentSubjectsHome readOnly studentId={wardId} />
  return (
    <SubjectsHome
      defaultView={isSchoolAdmin ? 'teachLog' : undefined}
      isViewingPastSession={isViewingPastSession}
    />
  )
}
