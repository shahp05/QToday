import TopNav from '../components/TopNav'
import LeftNav from '../components/LeftNav'
import RoleSwitcher from '../components/RoleSwitcher'
import IntroMessage from '../components/IntroMessage'
import StudentsEmpty from './students/StudentsEmpty'
import SubjectsPage  from './subjects/SubjectsPage'
import { useUI } from '../context/UIContext'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

function IconDemo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
    </svg>
  )
}

const PAGE_TITLES = {
  students: 'Students',
  teachers: 'Teachers',
  subjects: 'Subjects',
  account:  'Account',
}

/* Renders the correct content component for the active page */
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
  const hasContent     = activePage !== null

  return (
    <div className="dashboard">

      {/* ── Left nav ──────────────────────────────────────────────────────── */}
      <LeftNav />

      {/* ── Right column: top bar + body ──────────────────────────────────── */}
      <div className="dashboard-right">
        <header className="dashboard-topbar">
          <TopNav />
          <button className="demo-trigger" onClick={() => navigate('/demo')} title="Demo">
            <IconDemo />
            <span>Demo</span>
          </button>
        </header>


        <div className="dashboard-body">
          <main className="dashboard-main">
            {hasContent ? <PageContent activePage={activePage} /> : <IntroMessage />}
          </main>
        </div>
      </div>

      <RoleSwitcher />
    </div>
  )
}
