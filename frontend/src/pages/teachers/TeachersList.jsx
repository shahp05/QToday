import { useState } from 'react'
import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import { CURRENT_SESSION_KEY, getActiveSessionKey, useSessionsStore } from '../../store/sessionsStore'
import { resolveFileUrl } from '../../lib/api'
import { uploadMyPhoto } from '../../services/photoService'
import EditablePhoto from '../../components/EditablePhoto'
import { Toast } from '../../components/ui/Toast'
import PageHeader from '../../components/PageHeader'
import './TeachersList.css'

// A stable reference for "no cached data for this session yet" — returning
// a fresh [] from a zustand selector instead would make React think the
// store keeps changing on every read, causing an infinite re-render loop.
const EMPTY_ARRAY = []

function IconTick() {
  return (
    <svg className="teachers-superadmin-tick" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="#343434" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconBoxSpinner() {
  return <span className="teachers-superadmin-spinner" role="status" aria-label="Updating" />
}

export default function TeachersList({ onUploadNew, onBack }) {
  const isAdmin = useProfileStore(s => s.is_school_admin)
  const myOrgId = useProfileStore(s => s.org_id)
  const activeKey = useSessionsStore(getActiveSessionKey)
  const teachers = useTeachersStore(s => s.bySession[activeKey]?.teachers ?? EMPTY_ARRAY)
  const setSuperAdmin = useTeachersStore(s => s.setSuperAdmin)
  const updateTeacherPhoto = useTeachersStore(s => s.updateTeacherPhoto)
  const rows = [...teachers].sort((a, b) => a.name.localeCompare(b.name))
  // Super-admin status is a live/current-only concept (see the permission
  // matrix design) — locked for any non-current session, same as upload
  // being hidden entirely for one.
  const isViewingCurrent = activeKey === CURRENT_SESSION_KEY

  const [pendingOrgId, setPendingOrgId] = useState(null)
  const [error, setError] = useState('')

  async function handleToggle(row, locked) {
    if (locked) return
    setPendingOrgId(row.org_id)
    try {
      await setSuperAdmin(row.org_id, !row.is_super_admin)
    } catch (err) {
      setError(err.message)
    } finally {
      setPendingOrgId(null)
    }
  }

  // A teacher may only ever set their own photo here — not a colleague's.
  async function handlePhotoUpload(row, file) {
    const data = await uploadMyPhoto(file)
    updateTeacherPhoto(row.user_id, data.photo_url)
  }

  return (
    <div className="teachers-list">
      <PageHeader
        title="Teachers"
        onBack={onBack}
        actions={isAdmin && onUploadNew && (
          <button className="teachers-list-upload-btn" onClick={onUploadNew}>
            Upload new file
          </button>
        )}
      />

      <div className="teachers-list-body">
        <div className="teachers-rows">
          {rows.map(row => {
            const isSelf = row.org_id === myOrgId
            const isPending = pendingOrgId === row.org_id
            const locked = !isAdmin || isSelf || isPending || !isViewingCurrent
            return (
              <div className="teachers-row" key={row.org_id}>
                <div className="teachers-row-top">
                  <span className="teachers-row-photo">
                    <EditablePhoto
                      editable={isSelf}
                      thumbClassName="teachers-thumb"
                      placeholderClassName="teachers-thumb--placeholder"
                      name={row.name}
                      photoUrl={resolveFileUrl(row.photo_url)}
                      onUpload={file => handlePhotoUpload(row, file)}
                      onError={setError}
                    />
                  </span>
                  <span className="teachers-row-namecell">
                    <span className="teachers-row-titlerow">
                      <span className="teachers-row-id">{row.org_id}</span>
                      <span className="teachers-row-name">{row.name}</span>
                    </span>
                    <span className="teachers-row-email">{row.email}</span>
                  </span>
                  <label className={`teachers-row-superadmin${locked ? ' teachers-row-superadmin--locked' : ''}`}>
                    <span className="teachers-superadmin-control">
                      <input
                        type="checkbox"
                        className="teachers-superadmin-input"
                        checked={row.is_super_admin}
                        disabled={locked}
                        onChange={() => handleToggle(row, locked)}
                      />
                      <span className="teachers-superadmin-box">
                        {isPending ? <IconBoxSpinner /> : <IconTick />}
                      </span>
                    </span>
                    Super admin
                  </label>
                </div>
                {row.subjects?.length > 0 && (
                  <div className="teachers-row-subjects">
                    {row.subjects.map(subject => (
                      <span className="teachers-subject-chip" key={subject.subject_id}>
                        <span className="teachers-subject-chip-name">{subject.subject_name}</span>
                        <span className="teachers-subject-chip-grades">
                          {subject.grades.map(g => g.grade_name).join(', ')}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Toast message={error} onDismiss={() => setError('')} />
    </div>
  )
}
