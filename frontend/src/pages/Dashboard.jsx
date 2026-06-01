import LeftNav from '../components/LeftNav'
import RoleSwitcher from '../components/RoleSwitcher'
import IntroMessage from '../components/IntroMessage'
import StudentsEmpty from './students/StudentsEmpty'
import SubjectsList from './subjects/SubjectsList'
import SubjectsPage from './subjects/SubjectsPage'
import { useUI } from '../context/UIContext'
import { useNavigate } from 'react-router-dom'
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

function PageContent({ activePage }) {
  switch (activePage) {
    case 'students': return <StudentsEmpty />
    case 'subjects': return <SubjectsPage />
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
  const { activePage } = useUI()
  const navigate       = useNavigate()

  return (
    <div className="dashboard">

      {/* ── Panel 1: icon nav ─────────────────────────────────────────────── */}
      <LeftNav />

      {/* ── Panel 2: subjects list ────────────────────────────────────────── */}
      {activePage === 'subjects' && (
        <div className="dashboard-panel2">
          <SubjectsList />
        </div>
      )}

      {/* ── Panel 3: main content ─────────────────────────────────────────── */}
      <div className="dashboard-panel3">
        {activePage ? <PageContent activePage={activePage} /> : <IntroMessage />}
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
