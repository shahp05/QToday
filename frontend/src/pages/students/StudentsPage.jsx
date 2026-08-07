import { useRef, useState } from 'react'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'
import StudentSubjectDetail from './StudentSubjectDetail'

export default function StudentsPage() {
  const studentCount = useStudentsStore(s => s.students.length)
  const ensureStudentProgressLoaded = useStudentDetailProgressStore(s => s.ensureLoaded)
  const [showUpload, setShowUpload] = useState(false)
  const [detail, setDetail] = useState(null) // { student, subjectId } | null
  const [loadingChip, setLoadingChip] = useState(null) // { studentId, subjectId } | null
  // Lifted out of StudentsList so the teacher's grade/section filter survives
  // a round trip through the student detail view — StudentsList unmounts
  // while that's showing, which would otherwise reset its own local state
  // back to the default grade/section on the way back.
  const [selectedGrade, setSelectedGrade] = useState(null)
  const [selectedSection, setSelectedSection] = useState(null)
  const scrollTopRef = useRef(0)

  // Shows a spinner on the clicked chip while the student's scores load
  // (cached per student — see studentDetailProgressStore), then opens the
  // detail page once the data is actually there instead of navigating to a
  // page that has to load itself.
  async function openSubject(student, subjectId) {
    if (loadingChip) return
    scrollTopRef.current = document.querySelector('.dashboard-panel3')?.scrollTop ?? 0
    setLoadingChip({ studentId: student.student_id, subjectId })
    await ensureStudentProgressLoaded(student.student_id)
    setLoadingChip(null)
    setDetail({ student, subjectId })
  }

  function closeDetail() {
    setDetail(null)
    requestAnimationFrame(() => {
      const panel = document.querySelector('.dashboard-panel3')
      if (panel) panel.scrollTop = scrollTopRef.current
    })
  }

  if (detail) {
    return (
      <StudentSubjectDetail
        key={detail.student.student_id}
        student={detail.student}
        initialSubjectId={detail.subjectId}
        onBack={closeDetail}
      />
    )
  }

  if (studentCount > 0 && !showUpload) {
    return (
      <StudentsList
        onUploadNew={() => setShowUpload(true)}
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
