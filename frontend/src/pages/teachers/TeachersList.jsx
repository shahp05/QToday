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

function mailtoHref(email) {
  return `mailto:${email}?subject=${encodeURIComponent('QToday')}`
}

// No way to detect an actual mailto failure (the browser doesn't report
// back), so this is shown proactively on every click rather than reactively
// — same wording the removed StudentsList contact popover used to show
// behind an extra info-icon click.
const MAILTO_HINT = 'Opens your default email app. If nothing happens, set your email app as the default for mailto links in your browser settings.'

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
  // { message, variant } — one shared toast slot for every error/notice on
  // this page (photo upload, super-admin toggle, the mailto hint), so only
  // one can ever be on screen at a time.
  const [toast, setToast] = useState({ message: '', variant: 'error' })
  const dismissToast = () => setToast(t => ({ ...t, message: '' }))

  async function handleToggle(row, locked) {
    if (locked) return
    setPendingOrgId(row.org_id)
    try {
      await setSuperAdmin(row.org_id, !row.is_super_admin)
    } catch (err) {
      setToast({ message: err.message, variant: 'error' })
    } finally {
      setPendingOrgId(null)
    }
  }

  function handleMailtoClick() {
    setToast({ message: MAILTO_HINT, variant: 'info' })
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
                      onError={message => setToast({ message, variant: 'error' })}
                    />
                  </span>
                  <span className="teachers-row-namecell">
                    <span className="teachers-row-titlerow">
                      <span className="teachers-row-id">{row.org_id}</span>
                      <span className="teachers-row-name">{row.name}</span>
                    </span>
                    {isSelf ? (
                      <span className="teachers-row-email">{row.email}</span>
                    ) : (
                      <a className="teachers-row-email teachers-row-email--link" href={mailtoHref(row.email)} onClick={handleMailtoClick}>
                        {row.email}
                      </a>
                    )}
                  </span>
                </div>
                <div className="teachers-row-side">
                  <label className={`teachers-row-superadmin${locked ? ' teachers-row-superadmin--locked' : ''}${row.is_super_admin ? ' teachers-row-superadmin--checked' : ''}`}>
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
                  {row.subjects?.length > 0 && (
                    <div className="teachers-row-subjects">
                      {row.subjects.map(subject => (
                        <span className="teachers-subject-chip" key={subject.subject_id}>
                          <span className="teachers-subject-chip-name">{subject.subject_name}</span>
                          <span className="teachers-subject-chip-grades">
                            {subject.grades.map(g => (
                              <span className="teachers-grade-count" key={g.grade_id}>{g.grade_name}</span>
                            ))}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
    </div>
  )
}
