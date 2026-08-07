import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import LoginQuote from '../components/LoginQuote'

const LOGIN_QUOTE_DURATION_MS = 5000

// The /dashboard index route — also the root of back-navigation history
// (see LeftNav/PageHeader onBack wiring). Mounts fresh every time the user
// lands on /dashboard, whether that's the initial post-login visit or the
// user backing all the way out of a page — so the quote and its timer
// always restart from scratch rather than resuming a stale one.
export default function DashboardQuote() {
  const navigate         = useNavigate()
  const isStudent        = useProfileStore(s => s.is_student)
  const isSchoolTeacher  = useProfileStore(s => s.is_school_teacher)
  const isSchoolAdmin    = useProfileStore(s => s.is_school_admin)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isStudent || isSchoolTeacher || isSchoolAdmin) {
        navigate('/dashboard/subjects')
      } else {
        setExpired(true)
      }
    }, LOGIN_QUOTE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [isStudent, isSchoolTeacher, isSchoolAdmin, navigate])

  if (expired) {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Select a page from the menu to get started.</p>
      </div>
    )
  }

  return <LoginQuote />
}
