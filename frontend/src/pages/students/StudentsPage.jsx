import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../../store/profileStore'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import { useStudentsListFilterStore } from '../../store/studentsListFilterStore'
import { getActiveSession, getActiveSessionKey, useSessionsStore } from '../../store/sessionsStore'
import { usePageView } from '../../hooks/usePageView'
import { useStudentsFeatureVisible } from '../../hooks/useStudentsFeatureVisible'
import PageLoading from '../../components/PageLoading'
import EmptyFeatureState from '../../components/EmptyFeatureState'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

// Same path/fill as LeftNav's IconStudents, just rendered larger for the
// empty-state message (see SubjectsRoute's IconSubjectsLarge for the same
// pattern).
function IconStudentsLarge() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
    </svg>
  )
}

// Placeholder copy — real per-case wording still to come.
const NO_STUDENTS_PAST_MESSAGE = 'No students were added in this academic session.'
const NO_STUDENTS_CURRENT_TEACHER_MESSAGE = 'Your super-admin has not uploaded the list of students for this academic session yet.'

export default function StudentsPage() {
  const navigate = useNavigate()
  usePageView('students') // every page-header page names itself in the URL
  // Per spec, the Students feature is hidden (nav icon + this route) once
  // there's nothing for the current role/session/roster state to show — see
  // the hook's own docstring for the exact matrix. Redirected away here
  // (not just left un-navigable from the nav icon) so a stale link, a Back
  // navigation, or the underlying roster changing out from under an
  // already-open page all land somewhere real instead of an empty screen.
  // Only acts once `ready` — never redirect on a still-loading guess.
  const { ready: studentsReady, visible: studentsVisible } = useStudentsFeatureVisible()
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
  // The roster gate (list vs. upload vs. empty message) is for whichever
  // session the left nav's picker is actually browsing — same source
  // StudentsList itself reads, so the two can never disagree about whether
  // there's anything to show for that session.
  const activeKey = useSessionsStore(getActiveSessionKey)
  const studentsStatus = useStudentsStore(s => s.bySession[activeKey]?.status ?? 'idle')
  const studentCount = useStudentGradesStore(s => (s.bySession[activeKey] ?? []).length)
  const ensureStudentProgressLoaded = useStudentDetailProgressStore(s => s.ensureLoaded)
  const [showUpload, setShowUpload] = useState(false)
  const fetchStudents = useStudentsStore(s => s.fetchStudents)
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const activeSession = useSessionsStore(getActiveSession)
  // A past session is always read-only — uploading must never target
  // history, per the session picker's whole point (see LeftNav). The
  // upload flow only ever gets offered for current/future below.
  const isViewingPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Kept fetched here, not inside StudentsEmpty — StudentsEmpty doesn't
  // mount at all when the current roster is non-empty, so an eager fetch
  // there would miss that (common) path. This is the one component always
  // mounted regardless of which sub-view renders, so the "Students N"
  // count for whichever non-current session is selected is ready before
  // the admin ever opens the dropdown. fetchStudents itself resolves
  // whether activeSessionId is actually current (normalizing to the same
  // cache slot Dashboard's eager fetch already populated, so this is a
  // no-op there) and whether the signed-in role is even allowed to browse
  // a different one.
  useEffect(() => {
    fetchStudents(activeSessionId)
  }, [activeSessionId, fetchStudents])

  useEffect(() => {
    if (studentsReady && !studentsVisible) navigate('/dashboard', { replace: true })
  }, [studentsReady, studentsVisible, navigate])
  const [loadingChip, setLoadingChip] = useState(null) // { studentId, subjectId } | null
  // Lifted to a store (not local state) so the teacher's grade/section
  // filter survives navigating to a student's detail (a real route now,
  // which unmounts this component) and back.
  const selectedGrade = useStudentsListFilterStore(s => s.selectedGrade)
  const setSelectedGrade = useStudentsListFilterStore(s => s.setSelectedGrade)
  const selectedSection = useStudentsListFilterStore(s => s.selectedSection)
  const setSelectedSection = useStudentsListFilterStore(s => s.setSelectedSection)

  // Shows a spinner on the clicked chip while the student's scores load
  // (cached per student — see studentDetailProgressStore), then navigates
  // to the detail route once the data is actually there instead of
  // navigating to a page that has to load itself.
  async function openSubject(student, subjectId) {
    if (loadingChip) return
    setLoadingChip({ studentId: student.student_id, subjectId })
    await ensureStudentProgressLoaded(student.student_id)
    setLoadingChip(null)
    navigate(`/dashboard/students/${student.student_id}${subjectId != null ? `?subject=${subjectId}` : ''}`)
  }

  if (studentsReady && !studentsVisible) return null

  // Checked before the loading guard below — StudentsEmpty owns its own
  // loading/spinner state (including while uploadAndRefresh briefly flips
  // studentsStatus back to 'loading' mid-upload) and must not be swapped
  // out for the generic placeholder while it's doing that.
  if (showUpload) {
    return (
      <StudentsEmpty
        onUploaded={() => setShowUpload(false)}
        studentCount={studentCount}
        onShowList={() => setShowUpload(false)}
      />
    )
  }

  // No header yet — whether this page ends up as the list or the xlsx
  // upload screen (which has no header at all) isn't known until the
  // roster status settles, so showing "Students" + a back button here would
  // just flash and then disappear the moment studentCount turns out to be 0.
  if (studentsStatus === 'idle' || studentsStatus === 'loading') {
    return <PageLoading />
  }

  if (studentCount > 0) {
    return (
      <StudentsList
        onUploadNew={isViewingPastSession ? undefined : () => setShowUpload(true)}
        onBack={() => navigate(-1)}
        onSubjectClick={openSubject}
        loadingChip={loadingChip}
        selectedGrade={selectedGrade}
        onSelectedGradeChange={setSelectedGrade}
        selectedSection={selectedSection}
        onSelectedSectionChange={setSelectedSection}
      />
    )
  }

  // Empty roster for the browsed session. A past session is read-only —
  // there's no upload to offer, for either role — so it's always the
  // passive empty message. A current/future session still has an upload
  // path, but only a school admin can use it; a teacher gets the same
  // empty message instead (useStudentsFeatureVisible already guarantees
  // no other role reaches this branch at all).
  if (isViewingPastSession || !isSchoolAdmin) {
    return (
      <EmptyFeatureState
        icon={<IconStudentsLarge />}
        message={isViewingPastSession ? NO_STUDENTS_PAST_MESSAGE : NO_STUDENTS_CURRENT_TEACHER_MESSAGE}
      />
    )
  }
  return (
    <StudentsEmpty
      onUploaded={() => setShowUpload(false)}
      studentCount={studentCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
