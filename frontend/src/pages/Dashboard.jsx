import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import LeftNav from '../components/LeftNav'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useTopicCatalogStore } from '../store/topicCatalogStore'
import './Dashboard.css'

// Layout for everything under /dashboard: left icon nav + whichever child
// route is active. Which page shows (quote / students / teachers / subjects
// / a student's detail) is now driven entirely by the URL — see App.jsx —
// so real back-navigation is just the browser's own history.
export default function Dashboard() {
  const fetchStudents       = useStudentsStore(s => s.fetchStudents)
  const fetchTeachers       = useTeachersStore(s => s.fetchTeachers)
  const fetchSubjectsTaught = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const fetchTopicCatalog   = useTopicCatalogStore(s => s.fetchTopicCatalog)

  // Initial data load — intentionally mount-only. Runs on every /dashboard
  // mount, including a refresh — unlike the quote screen's auto-advance
  // flag (see dashboardQuoteStore), which is deliberately NOT reset here,
  // since a refresh must not re-arm it.
  useEffect(() => {
    fetchStudents()
    fetchTeachers()
    fetchSubjectsTaught()
    fetchTopicCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="dashboard">
      <LeftNav />
      <div className="dashboard-panel3">
        <Outlet />
      </div>
    </div>
  )
}
