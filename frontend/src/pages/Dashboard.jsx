import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import LeftNav from '../components/LeftNav'
import LoginQuote from '../components/LoginQuote'
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

const PAGE_TITLES = {
  subjects:  'Subjects',
  students:  'Students',
  teachers:  'Teachers',
  account:   'Account',
}

const LOGIN_QUOTE_DURATION_MS = 5000

function PageContent({ activePage, isStudent, isCustomerSysadmin }) {
  switch (activePage) {
    case 'subjects':
      return isStudent
        ? <StudentSubjectsHome />
        : <SubjectsHome defaultView={isCustomerSysadmin ? 'teachLog' : undefined} />
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
  const isSchoolTeacher               = useProfileStore(s => s.is_school_teacher)
  const isCustomerSysadmin            = useProfileStore(s => s.is_school_admin)
  const location                      = useLocation()
  const fetchStudents                 = useStudentsStore(s => s.fetchStudents)
  const fetchTeachers                 = useTeachersStore(s => s.fetchTeachers)
  const fetchSubjectsTaught           = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const fetchTopicCatalog             = useTopicCatalogStore(s => s.fetchTopicCatalog)
  const studentsStatus                = useStudentsStore(s => s.status)
  const teachersStatus                = useTeachersStore(s => s.status)
  const subjectsStatus                = useSubjectsTaughtStore(s => s.status)
  const [displayedPage, setDisplayedPage] = useState(null)
  const [showLoginQuote, setShowLoginQuote] = useState(!location.state?.firstVisit)

  // Runs once, on arrival, not on every location.state change.
  useEffect(() => {
    if (location.state?.firstVisit) {
      setActivePage('students')
      return
    }
    const timer = setTimeout(() => {
      if (isStudent || isSchoolTeacher || isCustomerSysadmin) {
        setActivePage('subjects')
      }
      setShowLoginQuote(false)
    }, LOGIN_QUOTE_DURATION_MS)
    return () => clearTimeout(timer)
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
        {showLoginQuote
          ? <LoginQuote />
          : displayedPage === 'students'
            ? <StudentsPage />
            : displayedPage === 'teachers'
              ? <TeachersPage />
              : displayedPage
                ? <PageContent activePage={displayedPage} isStudent={isStudent} isCustomerSysadmin={isCustomerSysadmin} />
                : (
                  <div className="content-card">
                    <p className="content-card-placeholder">Select a page from the menu to get started.</p>
                  </div>
                )
        }
      </div>

    </div>
  )
}
