import { useState } from 'react'
import { useStudentsStore } from '../../store/studentsStore'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

export default function StudentsPage() {
  const studentCount = useStudentsStore(s => s.students.length)
  const [showUpload, setShowUpload] = useState(false)

  if (studentCount > 0 && !showUpload) {
    return <StudentsList onUploadNew={() => setShowUpload(true)} />
  }
  return (
    <StudentsEmpty
      onUploaded={() => setShowUpload(false)}
      studentCount={studentCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
