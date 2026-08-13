import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { CURRENT_SESSION_KEY } from '../../store/sessionsStore'

// Merges the roster + grade stores into the {student_id, grade_id, name,
// photo_url} shape StudentSubjectDetail needs — same fields StudentsList's
// own useGroupedStudents builds, just for one student instead of every row,
// since /dashboard/students/:studentId only has the id, not the full record.
// Always the live current session's roster, same as before this store
// became session-cached — this route isn't wired to session browsing.
export function useStudentRow(studentId) {
  const student = useStudentsStore(s =>
    (s.bySession[CURRENT_SESSION_KEY]?.students ?? []).find(st => String(st.student_id) === String(studentId))
  )
  const grade = useStudentGradesStore(s =>
    (s.bySession[CURRENT_SESSION_KEY] ?? []).find(g => String(g.student_id) === String(studentId) && g.is_active)
  )

  if (!student || !grade) return null

  return {
    student_id: student.student_id,
    grade_id: grade.grade_id,
    org_id: student.org_id,
    name: student.name,
    photo_url: student.photo_url,
  }
}
