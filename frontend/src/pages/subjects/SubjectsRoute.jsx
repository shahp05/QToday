import { useProfileStore } from '../../store/profileStore'
import StudentSubjectsHome from './StudentSubjectsHome'
import SubjectsHome from './SubjectsHome'

// /dashboard/subjects — same URL for every role, different content: a
// student plays quizzes here, a teacher/admin logs what they taught.
export default function SubjectsRoute() {
  const isStudent      = useProfileStore(s => s.is_student)
  const isSchoolAdmin  = useProfileStore(s => s.is_school_admin)

  return isStudent
    ? <StudentSubjectsHome />
    : <SubjectsHome defaultView={isSchoolAdmin ? 'teachLog' : undefined} />
}
