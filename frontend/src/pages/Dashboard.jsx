import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LeftNav from '../components/LeftNav'
import RoleSwitcher from '../components/RoleSwitcher'
import IntroMessage from '../components/IntroMessage'
import StudentsEmpty from './students/StudentsEmpty'
import SubjectsList from './subjects/SubjectsList'
import SubjectsPage from './subjects/SubjectsPage'
import TeachTodayPage from './subjects/TeachTodayPage'
import { useUI } from '../context/UIContext'
import './Dashboard.css'

function IconDemo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
    </svg>
  )
}

const PAGE_TITLES = {
  teachers: 'Teachers',
  account:  'Account',
}

function StudentsIntro() {
  return (
    <div className="students-intro">
      <p>Use xlsx to add students any time. Accounts for new students will be created automatically as <code>id@acronym</code>. When they move to the next grade, simply upload a new xlsx with their next grade.</p>
    </div>
  )
}

function PageContent({ activePage }) {
  switch (activePage) {
    case 'subjects':  return <SubjectsPage />
    case 'subjects2': return <TeachTodayPage />
    default:
      return (
        <div className="content-card">
          <h2 className="content-card-title">{PAGE_TITLES[activePage] ?? activePage}</h2>
          <p className="content-card-placeholder">
            Content for {PAGE_TITLES[activePage] ?? activePage} goes here.
          </p>
        </div>
      )
  }
}

export default function Dashboard() {
  const { activePage, setActivePage } = useUI()
  const navigate                      = useNavigate()
  const location                      = useLocation()

  useEffect(() => {
    if (location.state?.firstVisit) {
      setActivePage('students')
    }
  }, [])

  return (
    <div className="dashboard">

      {/* ── Panel 1: icon nav ─────────────────────────────────────────────── */}
      <LeftNav />

      {/* ── Panel 2: context list ─────────────────────────────────────────── */}
      {activePage === 'subjects' && (
        <div className="dashboard-panel2">
          <SubjectsList />
        </div>
      )}
      {activePage === 'students' && (
        <div className="dashboard-panel2">
          <StudentsEmpty />
        </div>
      )}

      {/* ── Panel 3: main content ─────────────────────────────────────────── */}
      <div className="dashboard-panel3">
        {activePage === 'students'
          ? <StudentsIntro />
          : activePage
            ? <PageContent activePage={activePage} />
            : <IntroMessage />
        }
      </div>

      {/* ── Dev bar: Demo + Role switcher ─────────────────────────────────── */}
      <div className="dev-bar">
        <button className="demo-trigger" onClick={() => navigate('/demo')} title="Demo">
          <IconDemo />
          <span>Demo</span>
        </button>
        <RoleSwitcher />
      </div>

    </div>
  )
}
