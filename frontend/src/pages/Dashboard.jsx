import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LeftNav from '../components/LeftNav'
import RoleSwitcher from '../components/RoleSwitcher'
import IntroMessage from '../components/IntroMessage'
import StudentsPage from './students/StudentsPage'
import TeachersPage from './teachers/TeachersPage'
import SubjectsHome from './subjects/SubjectsHome'
import { useUI } from '../context/UIContext'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import './Dashboard.css'

function IconDemo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
    </svg>
  )
}

const PAGE_TITLES = {
  subjects:  'Subjects',
  students:  'Students',
  teachers:  'Teachers',
  account:   'Account',
}

function PageContent({ activePage }) {
  switch (activePage) {
    case 'subjects':  return <SubjectsHome />
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
  const fetchStudents                 = useStudentsStore(s => s.fetchStudents)
  const fetchTeachers                 = useTeachersStore(s => s.fetchTeachers)
  const fetchSubjectsTaught           = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const studentsStatus                = useStudentsStore(s => s.status)
  const teachersStatus                = useTeachersStore(s => s.status)
  const [displayedPage, setDisplayedPage] = useState(null)

  useEffect(() => {
    if (location.state?.firstVisit) {
      setActivePage('students')
    }
  }, [])

  useEffect(() => {
    fetchStudents()
    fetchTeachers()
    fetchSubjectsTaught()
  }, [])

  // Students/teachers data loads async on a left-nav button press — keep
  // whatever panel3 is currently showing until that fetch settles (loaded
  // or errored) instead of swapping to a blank/loading page mid-fetch. The
  // left-nav button itself shows the spinner for this wait.
  useEffect(() => {
    if (activePage === 'students' && (studentsStatus === 'idle' || studentsStatus === 'loading')) return
    if (activePage === 'teachers' && (teachersStatus === 'idle' || teachersStatus === 'loading')) return
    setDisplayedPage(activePage)
  }, [activePage, studentsStatus, teachersStatus])

  return (
    <div className="dashboard">

      {/* ── Panel 1: icon nav ─────────────────────────────────────────────── */}
      <LeftNav />

      {/* ── Panel 3: main content ─────────────────────────────────────────── */}
      <div className="dashboard-panel3">
        {displayedPage === 'students'
          ? <StudentsPage />
          : displayedPage === 'teachers'
            ? <TeachersPage />
            : displayedPage
              ? <PageContent activePage={displayedPage} />
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
