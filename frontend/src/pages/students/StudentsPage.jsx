import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import { useStudentsListFilterStore } from '../../store/studentsListFilterStore'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

export default function StudentsPage() {
  const navigate = useNavigate()
  const studentsStatus = useStudentsStore(s => s.status)
  const studentCount = useStudentsStore(s => s.students.length)
  const ensureStudentProgressLoaded = useStudentDetailProgressStore(s => s.ensureLoaded)
  const [showUpload, setShowUpload] = useState(false)
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

  if (studentsStatus === 'idle' || studentsStatus === 'loading') {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Loading…</p>
      </div>
    )
  }

  if (studentCount > 0 && !showUpload) {
    return (
      <StudentsList
        onUploadNew={() => setShowUpload(true)}
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
  return (
    <StudentsEmpty
      onUploaded={() => setShowUpload(false)}
      studentCount={studentCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
