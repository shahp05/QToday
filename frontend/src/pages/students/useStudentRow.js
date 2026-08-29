import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { getActiveSessionKey, useSessionsStore } from '../../store/sessionsStore'

// Merges the roster + grade stores into the {student_id, grade_id, name,
// photo_url} shape StudentSubjectDetail needs — same fields StudentsList's
// own useGroupedStudents builds, just for one student instead of every row,
// since /dashboard/students/:studentId only has the id, not the full record.
// Reads whichever session is currently browsed (getActiveSessionKey), not
// hard-coded to the live current one — a student reached via a chip click
// on a past session's Students list wouldn't resolve here otherwise (they
// may not even be in the current session's roster), leaving this route
// stuck on its "student not found" fallback with no way to tell why.
export function useStudentRow(studentId) {
  const activeKey = useSessionsStore(getActiveSessionKey)
  const student = useStudentsStore(s =>
    (s.bySession[activeKey]?.students ?? []).find(st => String(st.student_id) === String(studentId))
  )
  const grade = useStudentGradesStore(s =>
    (s.bySession[activeKey] ?? []).find(g => String(g.student_id) === String(studentId) && g.is_active)
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
