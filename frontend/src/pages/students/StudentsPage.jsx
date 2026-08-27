import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import { useStudentsListFilterStore } from '../../store/studentsListFilterStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { usePageView } from '../../hooks/usePageView'
import { useStudentsFeatureVisible } from '../../hooks/useStudentsFeatureVisible'
import PageLoading from '../../components/PageLoading'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

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
  // The top-level "does this school have any current students at all" gate
  // is always about the LIVE current session, regardless of what the left
  // nav's session picker happens to be browsing — that's a separate,
  // page-internal concern handled below via StudentsList.
  const studentsStatus = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  // NOT the raw students list length — that's every active account at the
  // school regardless of session, so it stays non-zero across a cutover
  // even when nobody's been uploaded into the new session yet. studentGrades
  // is already scoped to the current session (get_my_students' default,
  // session-filtered branch), and every active student has at most one row
  // in it — so its length is exactly "how many students actually have a
  // place in the current session," matching what StudentsList would show.
  const studentCount = useStudentGradesStore(s => (s.bySession[CURRENT_SESSION_KEY] ?? []).length)
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
  // Only reachable here with studentCount === 0 if the caller is a school
  // admin viewing the current/future session — useStudentsFeatureVisible's
  // own branching guarantees that (anyone else would have redirected away
  // above), so no separate isSchoolAdmin check is needed.
  return (
    <StudentsEmpty
      onUploaded={() => setShowUpload(false)}
      studentCount={studentCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
