import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useStudentsStore } from '../../store/studentsStore'
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
  const studentsStatus = useStudentsStore(s => s.status)
  const student = useStudentRow(studentId)

  if (!student) {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">
          {studentsStatus === 'loading' || studentsStatus === 'idle' ? 'Loading…' : 'Student not found.'}
        </p>
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
