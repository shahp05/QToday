import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import LeftNav from '../components/LeftNav'
import RoleSwitcher from '../components/RoleSwitcher'
import IntroMessage from '../components/IntroMessage'
import StudentsPage from './students/StudentsPage'
import TeachersPage from './teachers/TeachersPage'
import SubjectsHome from './subjects/SubjectsHome'
import StudentSubjectsHome from './subjects/StudentSubjectsHome'
import { useUI } from '../context/UIContext'
import { useProfileStore } from '../store/profileStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useTopicCatalogStore } from '../store/topicCatalogStore'
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

function PageContent({ activePage, isStudent }) {
  switch (activePage) {
    case 'subjects':  return isStudent ? <StudentSubjectsHome /> : <SubjectsHome />
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
  const isStudent                     = useProfileStore(s => s.is_student)
  const navigate                      = useNavigate()
  const location                      = useLocation()
  const fetchStudents                 = useStudentsStore(s => s.fetchStudents)
  const fetchTeachers                 = useTeachersStore(s => s.fetchTeachers)
  const fetchSubjectsTaught           = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const fetchTopicCatalog             = useTopicCatalogStore(s => s.fetchTopicCatalog)
  const studentsStatus                = useStudentsStore(s => s.status)
  const teachersStatus                = useTeachersStore(s => s.status)
  const subjectsStatus                = useSubjectsTaughtStore(s => s.status)
  const [displayedPage, setDisplayedPage] = useState(null)

  // Runs once, on arrival, not on every location.state change.
  useEffect(() => {
    if (location.state?.firstVisit) {
      setActivePage('students')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial data load — intentionally mount-only.
  useEffect(() => {
    fetchStudents()
    fetchTeachers()
    fetchSubjectsTaught()
    fetchTopicCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Students/teachers/subjects data loads async (subjects/students/teachers
  // are all kicked off together on Dashboard mount, above) — keep whatever
  // panel3 is currently showing until that fetch settles (loaded or
  // errored) instead of swapping to a blank/loading page mid-fetch. The
  // left-nav button itself shows the spinner for this wait. Done directly
  // during render (not in an effect) since the guard clauses above already
  // make repeated calls a no-op — a state adjustment, not a sync with an
  // external system.
  if (
    !(activePage === 'students' && (studentsStatus === 'idle' || studentsStatus === 'loading')) &&
    !(activePage === 'teachers' && (teachersStatus === 'idle' || teachersStatus === 'loading')) &&
    !(activePage === 'subjects' && (subjectsStatus === 'idle' || subjectsStatus === 'loading')) &&
    displayedPage !== activePage
  ) {
    setDisplayedPage(activePage)
  }

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
              ? <PageContent activePage={displayedPage} isStudent={isStudent} />
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
