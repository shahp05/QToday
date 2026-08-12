import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeachersStore } from '../../store/teachersStore'
import { usePageView } from '../../hooks/usePageView'
import PageLoading from '../../components/PageLoading'
import TeachersEmpty from './TeachersEmpty'
import TeachersList from './TeachersList'

export default function TeachersPage() {
  const navigate = useNavigate()
  usePageView('teachers') // every page-header page names itself in the URL
  const teachersStatus = useTeachersStore(s => s.status)
  const teacherCount = useTeachersStore(s => s.teachers.length)
  const [showUpload, setShowUpload] = useState(false)

  // Checked before the loading guard below — TeachersEmpty owns its own
  // loading/spinner state (including while uploadAndRefresh briefly flips
  // teachersStatus back to 'loading' mid-upload) and must not be swapped
  // out for the generic placeholder while it's doing that.
  if (showUpload) {
    return (
      <TeachersEmpty
        onUploaded={() => setShowUpload(false)}
        teacherCount={teacherCount}
        onShowList={() => setShowUpload(false)}
      />
    )
  }

  // No header yet — whether this page ends up as the list or the xlsx
  // upload screen (which has no header at all) isn't known until the
  // roster status settles, so showing "Teachers" + a back button here would
  // just flash and then disappear the moment teacherCount turns out to be 0.
  if (teachersStatus === 'idle' || teachersStatus === 'loading') {
    return <PageLoading />
  }

  if (teacherCount > 0) {
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
