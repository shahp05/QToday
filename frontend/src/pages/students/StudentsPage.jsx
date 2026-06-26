import { useState } from 'react'
import { useStudentsStore } from '../../store/studentsStore'
import StudentsEmpty from './StudentsEmpty'
import StudentsList from './StudentsList'
import './StudentsPage.css'

export default function StudentsPage() {
  const status = useStudentsStore(s => s.status)
  const studentCount = useStudentsStore(s => s.students.length)
  const [showUpload, setShowUpload] = useState(false)

  // Don't decide upload-vs-list until the first fetch has actually settled —
  // otherwise the empty/upload view flashes before the real student count
  // (still 0 from the initial store state) comes back from the API.
  if (status === 'idle' || status === 'loading') {
    return (
      <div className="students-page-loading">
        <span className="students-page-spinner" role="status" aria-label="Loading students" />
      </div>
    )
  }

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
