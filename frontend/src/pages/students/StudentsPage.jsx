import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../../store/profileStore'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import { useStudentsListFilterStore } from '../../store/studentsListFilterStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { usePageView } from '../../hooks/usePageView'
import PageLoading from '../../components/PageLoading'
import StudentsAwaitingUpload from './StudentsAwaitingUpload'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

export default function StudentsPage() {
  const navigate = useNavigate()
  usePageView('students') // every page-header page names itself in the URL
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
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
  // Only the sys admin can actually upload (the backend rejects anyone
  // else's POST /students/upload) — everyone else (a teacher/admin) sees a
  // read-only "not uploaded yet" message instead of a form they can't
  // submit.
  if (!isSchoolAdmin) {
    return <StudentsAwaitingUpload />
  }
  return (
    <StudentsEmpty
      onUploaded={() => setShowUpload(false)}
      studentCount={studentCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
