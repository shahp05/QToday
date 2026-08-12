import { useEffect } from 'react'
import { useSessionsStore } from '../../store/sessionsStore'
import './StudentsAwaitingUpload.css'

function IconStudents() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
    </svg>
  )
}

// Shown instead of the xlsx upload form to anyone who isn't the customer's
// sys admin (only they're allowed to upload — the backend rejects anyone
// else's POST /students/upload) when the current session's roster is still
// empty. Read-only, so a teacher never lands on a form they can't submit.
export default function StudentsAwaitingUpload() {
  const fetchSessions = useSessionsStore(s => s.fetchSessions)
  const sessionLabel = useSessionsStore(s => s.sessions.find(sess => sess.is_current)?.label)

  useEffect(() => { fetchSessions() }, [fetchSessions])

  return (
    <div className="students-awaiting-upload">
      <IconStudents />
      <p className="students-awaiting-upload-text">
        The list of students for academic session{' '}
        <span className="students-awaiting-upload-session">{sessionLabel ?? '—'}</span>
        {' '}has not been uploaded by the super admin yet.
      </p>
    </div>
  )
}
