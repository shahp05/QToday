import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import { useStudentsListFilterStore } from '../../store/studentsListFilterStore'
import { useSessionsStore } from '../../store/sessionsStore'
import { useFutureRosterStore } from '../../store/futureRosterStore'
import { usePageView } from '../../hooks/usePageView'
import PageLoading from '../../components/PageLoading'
import ScheduleSessionDialog from '../../components/ScheduleSessionDialog'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

export default function StudentsPage() {
  const navigate = useNavigate()
  usePageView('students') // every page-header page names itself in the URL
  const studentsStatus = useStudentsStore(s => s.status)
  // NOT useStudentsStore's raw students.length — that's every active
  // account at the school regardless of session, so it stays non-zero
  // across a cutover even when nobody's been uploaded into the new
  // session yet. studentGrades is already scoped to the current session
  // (get_my_students' default, session-filtered branch), and every active
  // student has at most one row in it — so its length is exactly "how many
  // students actually have a place in the current session," matching what
  // StudentsList would show.
  const studentCount = useStudentGradesStore(s => s.studentGrades.length)
  const ensureStudentProgressLoaded = useStudentDetailProgressStore(s => s.ensureLoaded)
  const [showUpload, setShowUpload] = useState(false)
  const [showSessionDialog, setShowSessionDialog] = useState(false)
  const futureSession = useSessionsStore(s => s.futureSession)
  const setStudentsViewTarget = useSessionsStore(s => s.setStudentsViewTarget)
  const fetchFutureRoster = useFutureRosterStore(s => s.fetchFutureRoster)

  // Kept fetched here, not inside StudentsEmpty — StudentsEmpty doesn't
  // mount at all when the current roster is non-empty, so an eager fetch
  // there would miss that (common) path. This is the one component always
  // mounted regardless of which sub-view renders, so the "Students N"
  // count for the future session is ready before the admin ever opens
  // the dropdown.
  useEffect(() => {
    if (futureSession) fetchFutureRoster(futureSession.session_id)
  }, [futureSession, fetchFutureRoster])
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
      <>
        <StudentsList
          onUploadNew={() => setShowUpload(true)}
          onStartNewSession={() => setShowSessionDialog(true)}
          onBack={() => navigate(-1)}
          onSubjectClick={openSubject}
          loadingChip={loadingChip}
          selectedGrade={selectedGrade}
          onSelectedGradeChange={setSelectedGrade}
          selectedSection={selectedSection}
          onSelectedSectionChange={setSelectedSection}
        />
        <ScheduleSessionDialog
          open={showSessionDialog}
          onClose={() => setShowSessionDialog(false)}
          onScheduled={() => {
            setStudentsViewTarget('future')
            setShowUpload(true)
          }}
        />
      </>
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
