import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import './TeachersList.css'

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
  const teachers = useTeachersStore(s => s.teachers)
  const rows = [...teachers].sort((a, b) => a.name.localeCompare(b.name))

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
          {rows.map(row => (
            <div className="teachers-row" key={row.org_id}>
              <span className="teachers-row-photo">
                <span className="teachers-thumb teachers-thumb--placeholder">{initials(row.name)}</span>
              </span>
              <span className="teachers-row-id">{row.org_id}</span>
              <span className="teachers-row-name">{row.name}</span>
              <span className="teachers-row-email">{row.email}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
