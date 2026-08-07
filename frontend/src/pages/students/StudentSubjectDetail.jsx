import { useEffect, useMemo, useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import SubjectTopicGrid, { SubjectFilterBar } from '../subjects/SubjectTopicGrid'
import StudentQuizProgress from '../subjects/StudentQuizProgress'
import PageHeader from '../../components/PageHeader'
import '../subjects/StudentSubjectsHome.css'

function IconProgress() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="20" x2="4" y2="14" />
      <line x1="10" y1="20" x2="10" y2="8" />
      <line x1="16" y1="20" x2="16" y2="4" />
      <line x1="2" y1="20" x2="20" y2="20" />
    </svg>
  )
}

function IconTopics() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <rect x="3" y="10" width="18" height="4" rx="1" />
      <rect x="3" y="16" width="18" height="4" rx="1" />
    </svg>
  )
}

// Teacher-facing mirror of StudentSubjectsHome for a single student — same
// header actions, subject dropdown, status strip, topic cards, and Progress
// (chart / quizzes played) toggle, scoped to one student's scores via the
// teacher/admin branch of GET /quizzes/progress and /quizzes/history (see
// resolve_authorized_student_id) instead of the "current user" stores the
// student's own page reads. Read-only throughout: no quiz-start (a teacher
// can't play as the student) and no per-quiz expand in Quizzes Played (quiz
// detail is gated to the student themselves server-side).
export default function StudentSubjectDetail({ student, initialSubjectId, onBack }) {
  const subjectsTaught = useSubjectsTaughtStore(s => s.subjects)
  const entry = useStudentDetailProgressStore(s => s.byStudent[student.student_id])
  const ensureLoaded = useStudentDetailProgressStore(s => s.ensureLoaded)
  const dismissError = useStudentDetailProgressStore(s => s.dismissError)
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialSubjectId ?? null)
  const [view, setView] = useState('topics') // 'topics' | 'progress'

  useEffect(() => { ensureLoaded(student.student_id) }, [student.student_id, ensureLoaded])

  const status = entry?.status ?? 'loading'
  const error = entry?.error ?? ''
  const topicStatsById = entry?.topicStatsById ?? {}
  const quizzes = entry?.quizzes ?? []

  // Same grade-scoping as StudentsList's gradeSubjects, but keeping full
  // topic objects (not just ids) since SubjectTopicGrid needs topic_name etc.
  const subjectsForGrade = useMemo(() => {
    return subjectsTaught
      .map(subject => ({
        ...subject,
        topics: subject.topics.filter(topic => topic.grades.some(g => g.grade_id === student.grade_id)),
      }))
      .filter(subject => subject.topics.length > 0)
  }, [subjectsTaught, student.grade_id])

  const activeSubjectId = subjectsForGrade.some(s => s.subject_id === selectedSubjectId)
    ? selectedSubjectId
    : subjectsForGrade[0]?.subject_id ?? null

  return (
    <div className="student-subjects">
      <PageHeader
        title={student.name}
        onBack={onBack}
        actions={(
          view === 'topics' ? (
            // Same rule as the student's own header (StudentSubjectsHome):
            // nothing to show until at least one quiz has been played.
            quizzes.length > 0 && (
              <button className="student-subjects-progress-btn" onClick={() => setView('progress')}>
                <IconProgress /> Progress
                <span className="student-subjects-progress-count">{quizzes.length}</span>
              </button>
            )
          ) : (
            <button className="student-subjects-progress-btn" onClick={() => setView('topics')}>
              <IconTopics /> Topics
            </button>
          )
        )}
        filter={view === 'topics' && status !== 'error' && subjectsForGrade.length > 0 && activeSubjectId != null && (
          <SubjectFilterBar
            subjects={subjectsForGrade}
            activeSubjectId={activeSubjectId}
            onSelectSubject={setSelectedSubjectId}
            topicStatsById={topicStatsById}
          />
        )}
      />

      {status === 'error' && <p className="student-subjects-error">{error}</p>}

      {status !== 'error' && subjectsForGrade.length === 0 && (
        <p className="content-card-placeholder" style={{ padding: '0 24px' }}>No subjects taught to this student's grade yet.</p>
      )}

      {status !== 'error' && subjectsForGrade.length > 0 && (
        view === 'progress' ? (
          <div className="student-subjects-body student-subjects-body--progress">
            <StudentQuizProgress
              subjects={subjectsForGrade}
              topicStatsById={topicStatsById}
              quizzes={quizzes}
              quizHistoryStatus={status}
              quizHistoryError={error}
              onDismissQuizHistoryError={() => dismissError(student.student_id)}
              readOnly
            />
          </div>
        ) : activeSubjectId != null && (
          <SubjectTopicGrid
            subjects={subjectsForGrade}
            activeSubjectId={activeSubjectId}
            topicStatsById={topicStatsById}
            readOnly
          />
        )
      )}
    </div>
  )
}
