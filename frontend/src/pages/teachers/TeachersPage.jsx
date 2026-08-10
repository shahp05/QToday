import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeachersStore } from '../../store/teachersStore'
import { usePageView } from '../../hooks/usePageView'
import PageHeader from '../../components/PageHeader'
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

  // Header renders immediately, before the roster has loaded — its
  // identity ("Teachers") doesn't depend on the data, so there's no
  // reason to make the whole page (including the back button) disappear
  // behind a spinner while just the body is still waiting.
  if (teachersStatus === 'idle' || teachersStatus === 'loading') {
    return (
      <div className="teachers-list">
        <PageHeader title="Teachers" onBack={() => navigate(-1)} />
        <PageLoading />
      </div>
    )
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
