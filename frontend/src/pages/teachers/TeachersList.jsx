import { useState } from 'react'
import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import { Toast } from '../../components/ui/Toast'
import './TeachersList.css'

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

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')
}

export default function TeachersList({ onUploadNew }) {
  const isAdmin = useProfileStore(s => s.is_school_admin)
  const myOrgId = useProfileStore(s => s.org_id)
  const teachers = useTeachersStore(s => s.teachers)
  const setSuperAdmin = useTeachersStore(s => s.setSuperAdmin)
  const rows = [...teachers].sort((a, b) => a.name.localeCompare(b.name))

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

  return (
    <div className="teachers-list">
      <div className="teachers-list-header">
        <h2 className="teachers-list-title">Teachers</h2>
        {isAdmin && (
          <button className="teachers-list-upload-btn" onClick={onUploadNew}>
            Upload new file
          </button>
        )}
      </div>

      <div className="teachers-list-body">
        <div className="teachers-rows">
          {rows.map(row => {
            const isSelf = row.org_id === myOrgId
            const isPending = pendingOrgId === row.org_id
            const locked = !isAdmin || isSelf || isPending
            return (
              <div className="teachers-row" key={row.org_id}>
                <span className="teachers-row-photo">
                  <span className="teachers-thumb teachers-thumb--placeholder">{initials(row.name)}</span>
                </span>
                <span className="teachers-row-id">{row.org_id}</span>
                <span className="teachers-row-namecell">
                  <span className="teachers-row-name">{row.name}</span>
                  <span className="teachers-row-email">{row.email}</span>
                </span>
                <label className={`teachers-row-superadmin${locked ? ' teachers-row-superadmin--locked' : ''}`}>
                  <span className="teachers-superadmin-control">
                    <input
                      type="checkbox"
                      className="teachers-superadmin-input"
                      checked={row.is_super_admin}
                      onChange={() => handleToggle(row, locked)}
                    />
                    <span className="teachers-superadmin-box">
                      {isPending ? <IconBoxSpinner /> : <IconTick />}
                    </span>
                  </span>
                  Super admin
                </label>
              </div>
            )
          })}
        </div>
      </div>

      <Toast message={error} onDismiss={() => setError('')} />
    </div>
  )
}
