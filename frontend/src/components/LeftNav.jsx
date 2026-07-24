import { useUI } from '../context/UIContext'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useQuizProgressStore } from '../store/quizProgressStore'
import { useQuizHistoryStore } from '../store/quizHistoryStore'
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
  { id: 'students',  label: 'Students',  Icon: IconStudents },
  { id: 'teachers',  label: 'Teachers',  Icon: IconTeachers },
  { id: 'account',   label: 'Account',   Icon: IconAccount  },
]

export default function LeftNav() {
  const { activePage, setActivePage, setActiveSubject } = useUI()
  const profile = useProfileStore()
  const clearProfile = useProfileStore(s => s.clearProfile)
  const clearStudents = useStudentsStore(s => s.clearStudents)
  const clearTeachers = useTeachersStore(s => s.clearTeachers)
  const clearSubjectsTaught = useSubjectsTaughtStore(s => s.clearSubjectsTaught)
  const clearQuizProgress = useQuizProgressStore(s => s.clearQuizProgress)
  const clearQuizHistory = useQuizHistoryStore(s => s.clearQuizHistory)
  const studentsStatus = useStudentsStore(s => s.status)
  const teachersStatus = useTeachersStore(s => s.status)
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const navigate = useNavigate()

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

  function handleNav(id) {
    setActivePage(id)
    if (id !== 'subjects') setActiveSubject(null)
  }

  function handleLogout() {
    clearProfile()
    clearStudents()
    clearTeachers()
    clearSubjectsTaught()
    clearQuizProgress()
    clearQuizHistory()
    navigate('/')
  }

  return (
    <aside className="leftnav" aria-label="Main navigation">

      <div className="leftnav-logo-cell">
        <img src={logo} alt="QToday" className="leftnav-logo-img" />
      </div>

      <nav className="leftnav-items">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`leftnav-item ${activePage === id ? 'leftnav-item--active' : ''}`}
            onClick={() => handleNav(id)}
            aria-label={label}
            aria-current={activePage === id ? 'page' : undefined}
          >
            {isLoadingById[id] ? <IconSpinner /> : <Icon />}
            <span className="leftnav-item-label">{label}</span>
          </button>
        ))}
      </nav>

      <div className="leftnav-spacer" />

      <div className="leftnav-info">
        {infoItems.map(({ label, value }) => (
          <div key={label} className="leftnav-info-block">
            <span className="leftnav-info-label">{label}</span>
            <span className="leftnav-info-value">{value}</span>
          </div>
        ))}
      </div>

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
