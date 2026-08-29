import { useEffect, useState } from 'react'
import { useStudentSubjectsStore, studentSubjectsCacheKey } from '../../store/studentSubjectsStore'
import { useStudentDetailProgressStore } from '../../store/studentDetailProgressStore'
import { useSessionsStore } from '../../store/sessionsStore'
import SubjectTopicGrid, { SubjectFilterBar } from '../subjects/SubjectTopicGrid'
import StudentQuizProgress from '../subjects/StudentQuizProgress'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/ui/Toast'
import { usePageView } from '../../hooks/usePageView'
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
// (chart / quizzes played) toggle. Two independent per-student fetches:
// quiz progress/history via the teacher/admin branch of GET /quizzes/
// progress and /quizzes/history (see resolve_authorized_student_id), and
// this student's own retention-aware subjects/topics tree via GET
// /teach-logs/subjects-taught?student_id=... (list_subjects_taught's
// staff-viewing-a-specific-student path — see its docstring). Not the
// teacher's own subjects page client-side-filtered by grade_id: a topic
// taught at an earlier grade with a retention range covering this
// student's grade only ever appears under the LEARNER's own grade, never
// under the grade it was originally taught at, so filtering the teacher's
// own tree could never have surfaced it. Read-only for quiz-play only — a
// teacher can't play as the student, so SubjectTopicGrid gets no
// onCardClick/onPlayClick — but per-quiz expand in Quizzes Played (question,
// answer, student's response, score) IS available, same as the student's
// own view, per spec; only Challenge Quiz Score stays student-only (see
// StudentQuizQaItem's readOnly gate, keyed off studentId being passed).
export default function StudentSubjectDetail({ student, initialSubjectId, onBack }) {
  // The session being browsed (site-wide picker) — this student's
  // subjects/topics tree differs per session (retention range, what was
  // taught when), unlike quiz progress/history below, which is inherently
  // cross-session and always fetched the same way regardless.
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const progressEntry = useStudentDetailProgressStore(s => s.byStudent[student.student_id])
  const ensureProgressLoaded = useStudentDetailProgressStore(s => s.ensureLoaded)
  const dismissProgressError = useStudentDetailProgressStore(s => s.dismissError)
  const subjectsKey = studentSubjectsCacheKey(student.student_id, activeSessionId)
  const subjectsEntry = useStudentSubjectsStore(s => s.byStudent[subjectsKey])
  const ensureSubjectsLoaded = useStudentSubjectsStore(s => s.ensureLoaded)
  const dismissSubjectsError = useStudentSubjectsStore(s => s.dismissError)
  // initialSubjectId arrives as a URL search-param string (see
  // StudentDetailRoute); subject_id from the API is a number, so the
  // straight comparison against it below (activeSubjectId) would always
  // miss without this.
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    initialSubjectId != null ? Number(initialSubjectId) : null
  )
  const [view, setView] = usePageView('topics') // 'topics' | 'progress' — coexists with ?subject=

  useEffect(() => { ensureProgressLoaded(student.student_id) }, [student.student_id, ensureProgressLoaded])
  useEffect(() => {
    ensureSubjectsLoaded(student.student_id, activeSessionId)
  }, [student.student_id, activeSessionId, ensureSubjectsLoaded])

  const progressStatus = progressEntry?.status ?? 'loading'
  const progressError = progressEntry?.error ?? ''
  const topicStatsById = progressEntry?.topicStatsById ?? {}
  const quizzes = progressEntry?.quizzes ?? []

  const subjectsStatus = subjectsEntry?.status ?? 'loading'
  const subjectsError = subjectsEntry?.error ?? ''
  const subjectsForGrade = subjectsEntry?.subjects ?? []

  // Either fetch failing is a real error for this page — there's nothing
  // useful to show without both. Only one Toast at a time; progress takes
  // priority simply because it was checked first, not for any real reason.
  const status = subjectsStatus === 'error' ? 'error'
    : progressStatus === 'error' ? 'error'
    : subjectsStatus === 'loading' || progressStatus === 'loading' ? 'loading'
    : 'loaded'
  const error = progressStatus === 'error' ? progressError : subjectsError
  const dismissError = () => { dismissProgressError(student.student_id); dismissSubjectsError(student.student_id, activeSessionId) }

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

      {status === 'error' && <Toast message={error} onDismiss={dismissError} />}

      {status !== 'error' && subjectsForGrade.length > 0 && (
        view === 'progress' ? (
          <div className="student-subjects-body student-subjects-body--progress">
            <StudentQuizProgress
              subjects={subjectsForGrade}
              topicStatsById={topicStatsById}
              quizzes={quizzes}
              quizHistoryStatus={progressStatus}
              quizHistoryError={progressError}
              onDismissQuizHistoryError={() => dismissProgressError(student.student_id)}
              studentId={student.student_id}
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
