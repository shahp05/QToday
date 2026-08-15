import { useProfileStore } from '../../store/profileStore'
import StudentSubjectsHome from './StudentSubjectsHome'
import SubjectsHome from './SubjectsHome'

// /dashboard/subjects — same URL for every role, different content: a
// student plays quizzes here, a teacher/admin logs what they taught, and a
// parent gets the same topic-card view as a student but read-only (no
// quiz-play) for their selected ward.
export default function SubjectsRoute() {
  const isStudent      = useProfileStore(s => s.is_student)
  const isParent       = useProfileStore(s => s.is_parent)
  const isSchoolAdmin  = useProfileStore(s => s.is_school_admin)

  if (isStudent) return <StudentSubjectsHome />
  if (isParent) return <StudentSubjectsHome readOnly />
  return <SubjectsHome defaultView={isSchoolAdmin ? 'teachLog' : undefined} />
}
