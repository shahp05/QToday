import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useStudentsStore } from '../../store/studentsStore'
import { CURRENT_SESSION_KEY } from '../../store/sessionsStore'
import PageHeader from '../../components/PageHeader'
import PageLoading from '../../components/PageLoading'
import { useStudentRow } from './useStudentRow'
import StudentSubjectDetail from './StudentSubjectDetail'

// /dashboard/students/:studentId — a student's subject/score detail,
// reached from a chip click on the Students list. Reads the student from
// the roster store by id (rather than receiving the full record via props)
// since it's a real route now and can be landed on directly (back/forward,
// a refresh) without StudentsList ever having rendered.
export default function StudentDetailRoute() {
  const { studentId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const studentsStatus = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  const student = useStudentRow(studentId)

  if (!student) {
    // The student's name isn't known yet at this point (that's the whole
    // reason we're loading), so the header shows a placeholder title —
    // but the back button doesn't depend on that, so it still works.
    if (studentsStatus === 'loading' || studentsStatus === 'idle') {
      return (
        <div className="student-subjects">
          <PageHeader title="Student" onBack={() => navigate(-1)} />
          <PageLoading />
        </div>
      )
    }
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Student not found.</p>
      </div>
    )
  }

  return (
    <StudentSubjectDetail
      key={studentId}
      student={student}
      initialSubjectId={searchParams.get('subject')}
      onBack={() => navigate(-1)}
    />
  )
}
