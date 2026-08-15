import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import LoginQuote from '../components/LoginQuote'

const LOGIN_QUOTE_DURATION_MS = 5000

// The /dashboard index route — also the root of back-navigation history
// (see LeftNav/PageHeader onBack wiring). Mounts fresh every time the user
// lands on /dashboard, whether that's the initial post-login visit or the
// user backing all the way out of a page, so it always shows a fresh
// random quote either way. The auto-advance-to-default-page timer, though,
// only ever runs the first time (hasAutoAdvanced) — landing back here via
// Back means the user is choosing to sit on the quote screen, not asking
// to be bounced straight back to the page they just left.
export default function DashboardQuote() {
  const navigate         = useNavigate()
  const isStudent        = useProfileStore(s => s.is_student)
  const isSchoolTeacher  = useProfileStore(s => s.is_school_teacher)
  const isSchoolAdmin    = useProfileStore(s => s.is_school_admin)
  const isParent         = useProfileStore(s => s.is_parent)
  const hasAutoAdvanced  = useDashboardQuoteStore(s => s.hasAutoAdvanced)
  const markAutoAdvanced = useDashboardQuoteStore(s => s.markAutoAdvanced)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (hasAutoAdvanced) return
    const timer = setTimeout(() => {
      markAutoAdvanced()
      if (isStudent || isSchoolTeacher || isSchoolAdmin || isParent) {
        navigate('/dashboard/subjects')
      } else {
        setExpired(true)
      }
    }, LOGIN_QUOTE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [hasAutoAdvanced, isStudent, isSchoolTeacher, isSchoolAdmin, isParent, navigate, markAutoAdvanced])

  if (expired) {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Select a page from the menu to get started.</p>
      </div>
    )
  }

  return <LoginQuote />
}
