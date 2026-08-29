import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { resolveFileUrl } from '../lib/api'
import { uploadMyPhoto } from '../services/photoService'
import EditablePhoto from '../components/EditablePhoto'
import { Toast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import { usePageView } from '../hooks/usePageView'
import './AccountPage.css'

// Minimal for now — just the self-photo-upload gap (spec 1.8), the one
// piece every role (including parents, who have no roster row anywhere
// else to upload from) previously had no way to reach at all. The rest of
// this page's content is deferred to when the Account page itself gets
// built out.
export default function AccountPage() {
  const navigate = useNavigate()
  usePageView('account') // every page-header page names itself in the URL
  const userName = useProfileStore(s => s.user_name)
  const photoUrl = useProfileStore(s => s.photo_url)
  const updateOwnPhoto = useProfileStore(s => s.updateOwnPhoto)
  const [error, setError] = useState('')

  async function handleUpload(file) {
    const data = await uploadMyPhoto(file)
    updateOwnPhoto(data.photo_url)
  }

  return (
    <div className="account-page">
      <PageHeader
        title="Account"
        onBack={() => navigate(-1)}
        actions={
          <EditablePhoto
            editable
            thumbClassName="account-photo-thumb"
            placeholderClassName="account-photo-thumb--placeholder"
            name={userName || ''}
            photoUrl={resolveFileUrl(photoUrl)}
            onUpload={handleUpload}
            onError={setError}
          />
        }
      />
      <Toast message={error} onDismiss={() => setError('')} />
    </div>
  )
}
