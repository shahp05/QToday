import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeachersStore } from '../../store/teachersStore'
import { usePageView } from '../../hooks/usePageView'
import TeachersEmpty from './TeachersEmpty'
import TeachersList from './TeachersList'

export default function TeachersPage() {
  const navigate = useNavigate()
  usePageView('teachers') // every page-header page names itself in the URL
  const teachersStatus = useTeachersStore(s => s.status)
  const teacherCount = useTeachersStore(s => s.teachers.length)
  const [showUpload, setShowUpload] = useState(false)

  if (teachersStatus === 'idle' || teachersStatus === 'loading') {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Loading…</p>
      </div>
    )
  }

  if (teacherCount > 0 && !showUpload) {
    return (
      <TeachersList
        onUploadNew={() => setShowUpload(true)}
        onBack={() => navigate(-1)}
      />
    )
  }
  return (
    <TeachersEmpty
      onUploaded={() => setShowUpload(false)}
      teacherCount={teacherCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
