import { useState } from 'react'
import { useTeachersStore } from '../../store/teachersStore'
import TeachersEmpty from './TeachersEmpty'
import TeachersList from './TeachersList'

export default function TeachersPage() {
  const teacherCount = useTeachersStore(s => s.teachers.length)
  const [showUpload, setShowUpload] = useState(false)

  if (teacherCount > 0 && !showUpload) {
    return <TeachersList onUploadNew={() => setShowUpload(true)} />
  }
  return (
    <TeachersEmpty
      onUploaded={() => setShowUpload(false)}
      teacherCount={teacherCount}
      onShowList={() => setShowUpload(false)}
    />
  )
}
