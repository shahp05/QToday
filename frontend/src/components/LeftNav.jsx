import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useFutureRosterStore } from '../store/futureRosterStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useQuizProgressStore } from '../store/quizProgressStore'
import { useQuizHistoryStore } from '../store/quizHistoryStore'
import { useClassQuizProgressStore } from '../store/classQuizProgressStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { useStudentsListFilterStore } from '../store/studentsListFilterStore'
import Dropdown from './Dropdown'
import ScheduleSessionDialog from './ScheduleSessionDialog'
import logo from '../assets/logo_48.webp'
import './LeftNav.css'

function IconSubjects() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
    </svg>
  )
}

function IconStudents() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
    </svg>
  )
}

function IconTeachers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55z"/>
      <path d="M12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>
    </svg>
  )
}

function IconAccount() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2zm12 4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm-9 8c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1H6v-1z"/>
    </svg>
  )
}

function IconSpinner() {
  return <span className="leftnav-item-spinner" role="status" aria-label="Loading" />
}

function IconLogout() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { id: 'subjects',  label: 'Subjects',  Icon: IconSubjects },
  // Only the customer's sys admin (uploads/manages the roster) and its
  // teachers (view it) have any use for this page — a student only has
  // their own row, and a parent's equivalent is their child(ren), not this.
  { id: 'students',  label: 'Students',  Icon: IconStudents, visible: p => p.is_school_admin || p.is_school_teacher },
  { id: 'teachers',  label: 'Teachers',  Icon: IconTeachers },
  { id: 'account',   label: 'Account',   Icon: IconAccount  },
]

export default function LeftNav() {
  const profile = useProfileStore()
  const clearProfile = useProfileStore(s => s.clearProfile)
  const clearStudents = useStudentsStore(s => s.clearStudents)
  const clearFutureRoster = useFutureRosterStore(s => s.clearFutureRoster)
  const clearTeachers = useTeachersStore(s => s.clearTeachers)
  const clearSubjectsTaught = useSubjectsTaughtStore(s => s.clearSubjectsTaught)
  const clearQuizProgress = useQuizProgressStore(s => s.clearQuizProgress)
  const clearQuizHistory = useQuizHistoryStore(s => s.clearQuizHistory)
  const clearClassProgress = useClassQuizProgressStore(s => s.clearClassProgress)
  const clearSessions = useSessionsStore(s => s.clearSessions)
  const resetQuoteAutoAdvance = useDashboardQuoteStore(s => s.reset)
  const clearStudentsListFilter = useStudentsListFilterStore(s => s.clear)
  const studentsStatus = useStudentsStore(s => s.status)
  const teachersStatus = useTeachersStore(s => s.status)
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const navigate = useNavigate()
  const location = useLocation()

  // Single site-wide session picker — replaces the old per-page "Schedule
  // Next Session" button and Students' own current/future toggle, both of
  // which only ever affected that one page. Every session-aware page reads
  // sessionsStore.activeSessionTarget directly, so switching here is what
  // makes "was this upload meant for the current or the new session?"
  // unambiguous everywhere at once, not just wherever the control happened
  // to live. Sys-admin only for now — they're the only role who can
  // schedule/upload into a session; read-only browsing of past sessions
  // for every role is a later step.
  const futureSession = useSessionsStore(s => s.futureSession)
  const currentSessionLabel = useSessionsStore(s => s.sessions.find(sess => sess.is_current)?.label)
  const activeSessionTarget = useSessionsStore(s => s.activeSessionTarget)
  const setActiveSessionTarget = useSessionsStore(s => s.setActiveSessionTarget)
  const [showSessionDialog, setShowSessionDialog] = useState(false)

  // Picking "future" before one has ever been scheduled opens the dialog
  // instead of switching to nothing — there's no future session yet to
  // switch the view to.
  function handleSessionChange(target) {
    if (target === 'future' && !futureSession) {
      setShowSessionDialog(true)
      return
    }
    setActiveSessionTarget(target)
  }

  const isLoadingById = {
    students: studentsStatus === 'idle' || studentsStatus === 'loading',
    teachers: teachersStatus === 'idle' || teachersStatus === 'loading',
    subjects: subjectsStatus === 'idle' || subjectsStatus === 'loading',
  }

  const infoItems = [
    { label: 'School',  value: profile.customer_acronym || '—' },
    { label: 'Board',   value: profile.board_code       || '—' },
    { label: 'Country', value: profile.country_name     || '—' },
  ]

  // Active state (and the isActive() guard below) match on a path prefix,
  // not exact equality, so Students stays highlighted while a student's
  // detail route (/dashboard/students/:id) is open too.
  function isActive(id) {
    return location.pathname === `/dashboard/${id}` || location.pathname.startsWith(`/dashboard/${id}/`)
  }

  function handleNav(id) {
    if (isActive(id)) return
    navigate(`/dashboard/${id}`)
  }

  function handleLogout() {
    clearProfile()
    clearStudents()
    clearFutureRoster()
    clearTeachers()
    clearSubjectsTaught()
    clearQuizProgress()
    clearQuizHistory()
    clearClassProgress()
    clearSessions()
    clearStudentsListFilter()
    resetQuoteAutoAdvance()
    navigate('/')
  }

  return (
    <aside className="leftnav" aria-label="Main navigation">

      <div className="leftnav-logo-cell">
        <img src={logo} alt="QToday" className="leftnav-logo-img" />
      </div>

      <nav className="leftnav-items">
        {NAV_ITEMS.filter(item => !item.visible || item.visible(profile)).map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`leftnav-item ${isActive(id) ? 'leftnav-item--active' : ''}`}
            onClick={() => handleNav(id)}
            aria-label={label}
            aria-current={isActive(id) ? 'page' : undefined}
          >
            {isLoadingById[id] ? <IconSpinner /> : <Icon />}
            <span className="leftnav-item-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="leftnav-spacer" />

      <div className="leftnav-info">
        {profile.is_school_admin && (
          <div className="leftnav-session-block">
            <span className="leftnav-info-label">Session</span>
            <Dropdown
              className="leftnav-session-dropdown"
              value={activeSessionTarget}
              onChange={handleSessionChange}
              options={[
                { key: 'current', label: currentSessionLabel || 'Current' },
                { key: 'future', label: futureSession ? futureSession.label : 'New session' },
              ]}
            />
          </div>
        )}
        {infoItems.map(({ label, value }) => (
          <div key={label} className="leftnav-info-block">
            <span className="leftnav-info-label">{label}</span>
            <span className="leftnav-info-value">{value}</span>
          </div>
        ))}
      </div>

      <ScheduleSessionDialog
        open={showSessionDialog}
        onClose={() => setShowSessionDialog(false)}
        onScheduled={() => setActiveSessionTarget('future')}
      />

      <button
        className="leftnav-item leftnav-item--logout"
        onClick={handleLogout}
        aria-label="Logout"
      >
        <IconLogout />
        <span className="leftnav-item-label">Logout</span>
      </button>

    </aside>
  )
}
