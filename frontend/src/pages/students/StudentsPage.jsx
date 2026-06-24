import { useState } from 'react'
import { useStudentsStore } from '../../store/studentsStore'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'

export default function StudentsPage() {
  const hasStudents = useStudentsStore(s => s.students.length > 0)
  const [showUpload, setShowUpload] = useState(false)

  if (hasStudents && !showUpload) {
    return <StudentsList onUploadNew={() => setShowUpload(true)} />
  }
  return <StudentsEmpty onUploaded={() => setShowUpload(false)} />
}
