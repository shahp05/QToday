import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useQuizProgressStore } from '../../store/quizProgressStore'
import { useQuizHistoryStore } from '../../store/quizHistoryStore'
import { fetchQuizStatus, startQuiz as fetchQuizQuestions } from '../../services/quizService'
import { Toast } from '../../components/ui/Toast'
import PageHeader from '../../components/PageHeader'
import PageLoading from '../../components/PageLoading'
import { usePageView } from '../../hooks/usePageView'
import QuizPage from './QuizPage'
import StudentQuizProgress from './StudentQuizProgress'
import SubjectTopicGrid, { SubjectFilterBar } from './SubjectTopicGrid'
import './StudentSubjectsHome.css'

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

// Resolves once a store's status reaches 'loaded' or 'error' — waits on the
// in-flight fetch each store already kicks off at mount rather than
// triggering a redundant second one.
function waitForStatus(useStore) {
  return new Promise(resolve => {
    const isDone = state => state.status === 'loaded' || state.status === 'error'
    if (isDone(useStore.getState())) return resolve()
    const unsubscribe = useStore.subscribe(state => {
      if (isDone(state)) {
        unsubscribe()
        resolve()
      }
    })
  })
}

// readOnly: a parent viewing their selected ward's subjects (studentId set
// — the ward's own student_id), or a student browsing a past session (
// studentId stays null, self). Either way quiz-play (Play button,
// card-click) is disabled for readOnly, but Progress/quiz history is not
// — a parent can see their ward's progress, per spec, and a student can
// review their own past-session history too.
export default function StudentSubjectsHome({ readOnly = false, studentId = null }) {
  const navigate = useNavigate()
  const [view, setView] = usePageView('topics') // 'topics' | 'progress'
  // subjects (and each subject's topics) already arrive alphabetically
  // sorted from the backend — see teach_log_service.list_subjects_taught.
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsError = useSubjectsTaughtStore(s => s.error)
  const clearSubjectsError = useSubjectsTaughtStore(s => s.clearError)
  const topicStatsById = useQuizProgressStore(s => s.topicStatsById)
  const fetchQuizProgress = useQuizProgressStore(s => s.fetchQuizProgress)
  const quizHistory = useQuizHistoryStore(s => s.quizzes)
  const quizHistoryStatus = useQuizHistoryStore(s => s.status)
  const quizHistoryError = useQuizHistoryStore(s => s.error)
  const dismissQuizHistoryError = useQuizHistoryStore(s => s.dismissQuizHistoryError)
  const fetchQuizHistory = useQuizHistoryStore(s => s.fetchQuizHistory)
  const refreshQuizHistory = useQuizHistoryStore(s => s.refreshQuizHistory)
  const [progressLoading, setProgressLoading] = useState(false)
  const [selectedSubjectId, setSelectedSubjectId] = useState(null)
  const [activeQuiz, setActiveQuiz] = useState(null) // { topicId, gradeId, subjectName, topicName, questions, totalMarks } | null
  const [loadingQuiz, setLoadingQuiz] = useState(null) // { topicId, source: 'play' | 'card' } | null
  const [quizError, setQuizError] = useState('')
  // topic_id -> quiz_id, for topics whose LLM scoring pass hasn't finished
  // yet — derived from quizHistory (not local submit-time state) so the
  // "scoring in progress" card and the Play-block below it survive a page
  // reload: quizHistory is always fetched fresh on mount, and a quiz whose
  // scoring is still pending simply has is_scored=false in that data,
  // regardless of whether this component was mounted when it was submitted.
  const scoringTopics = useMemo(() => {
    const map = {}
    for (const q of quizHistory) {
      if (!q.is_scored) map[q.topic_id] = q.quiz_id
    }
    return map
  }, [quizHistory])

  // Quiz progress/history: self by default (studentId omitted resolves to
  // the caller server-side), or a parent's selected ward when studentId is
  // given — resolve_authorized_student_id now authorizes both. Always
  // fetched regardless of readOnly: neither a parent viewing their ward's
  // progress nor a student reviewing a past session's own history should
  // be blocked from seeing it, only from playing/challenging a quiz.
  useEffect(() => { fetchQuizProgress(studentId) }, [studentId, fetchQuizProgress])
  // Fetched eagerly (not gated on the Progress click) so the button can show
  // a total-quizzes-played count across every subject as soon as the page loads.
  useEffect(() => { fetchQuizHistory(studentId) }, [studentId, fetchQuizHistory])

  // Polls every scoring-in-progress quiz until the background LLM pass
  // (jobs/tasks.py:score_quiz_task) finishes — see conversation history for
  // why polling was chosen over a push transport (no websocket infra yet).
  // Keeps running even if the student navigates away from this page's quiz
  // and back, since the job itself is server-side and independent of this
  // component's lifetime; only the polling loop is client-local.
  useEffect(() => {
    const topicIds = Object.keys(scoringTopics)
    if (topicIds.length === 0) return
    const interval = setInterval(async () => {
      for (const topicId of topicIds) {
        try {
          const status = await fetchQuizStatus(scoringTopics[topicId])
          if (status.is_scored) {
            // scoringTopics is derived from quizHistory (above), so refetching
            // it is what actually clears this topic's pending state — no
            // local state to delete here.
            fetchQuizProgress()
            refreshQuizHistory()
          }
        } catch {
          // transient network/poll failure — try again next tick
        }
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [scoringTopics, fetchQuizProgress, refreshQuizHistory])

  // "Play" only makes sense when the viewer is the one who'll take the
  // quiz — a parent viewing their ward's subjects sees "Subjects" instead.
  const pageTitle = readOnly ? 'Subjects' : 'Play'

  if (activeQuiz) {
    return (
      <QuizPage
        subjectName={activeQuiz.subjectName}
        topicName={activeQuiz.topicName}
        topicId={activeQuiz.topicId}
        gradeId={activeQuiz.gradeId}
        questions={activeQuiz.questions}
        totalMarks={activeQuiz.totalMarks}
        onExit={result => {
          setActiveQuiz(null)
          if (!result) return // quit without submitting
          if (result.pending_count === 0) {
            fetchQuizProgress()
          }
          // refreshQuizHistory() is what actually surfaces "scoring in
          // progress" for this topic now — scoringTopics is derived from
          // quizHistory (above), not set locally here.
          refreshQuizHistory()
        }}
      />
    )
  }

  // Header renders immediately, before subjects have loaded — its
  // identity ("Play") doesn't depend on the data, so there's no reason to
  // make the whole page (including the back button) disappear behind a
  // spinner while just the body is still waiting.
  if (subjectsStatus === 'loading' || subjectsStatus === 'idle') {
    return (
      <div className="student-subjects">
        <PageHeader title={pageTitle} onBack={() => navigate(-1)} />
        <PageLoading />
      </div>
    )
  }

  if (subjectsStatus === 'error') {
    return (
      <div className="student-subjects">
        <PageHeader title={pageTitle} onBack={() => navigate(-1)} />
        <Toast message={subjectsError} onDismiss={clearSubjectsError} />
      </div>
    )
  }

  if (subjects.length === 0) {
    return null
  }

  const activeSubjectId = subjects.some(s => s.subject_id === selectedSubjectId)
    ? selectedSubjectId
    : subjects[0].subject_id
  const activeSubject = subjects.find(s => s.subject_id === activeSubjectId)

  // Guards against the Progress page ever rendering its own inline loader on
  // first show — quizHistory/quizProgress are fetched eagerly at mount, but
  // this covers the slow-network case where the click lands before either
  // has settled.
  async function openProgress() {
    setProgressLoading(true)
    await Promise.all([
      waitForStatus(useQuizHistoryStore),
      waitForStatus(useQuizProgressStore),
    ])
    setProgressLoading(false)
    setView('progress')
  }

  async function startQuiz(topic, source) {
    if (loadingQuiz || scoringTopics[topic.topic_id]) return
    const gradeId = topic.grades[0]?.grade_id
    if (gradeId == null) return
    setQuizError('')
    setLoadingQuiz({ topicId: topic.topic_id, source })
    try {
      const data = await fetchQuizQuestions(topic.topic_id, gradeId)
      setActiveQuiz({
        topicId: topic.topic_id,
        gradeId,
        subjectName: activeSubject.subject_name,
        topicName: topic.topic_name,
        questions: data.questions,
        totalMarks: data.total_marks,
      })
    } catch (err) {
      setQuizError(err.message)
    } finally {
      setLoadingQuiz(null)
    }
  }

  return (
    <div className="student-subjects">
      <PageHeader
        title={pageTitle}
        onBack={() => navigate(-1)}
        actions={(
          view === 'topics' ? (
            // Nothing to show progress on until at least one quiz has been
            // played — quizHistory updates live once a pending quiz's LLM
            // scoring finishes (see the scoring-poll effect below), so the
            // button appears the moment that happens, no reload needed.
            quizHistory.length > 0 && (
              <button className="student-subjects-progress-btn" onClick={openProgress} disabled={progressLoading}>
                {progressLoading ? <span className="student-topic-spinner" /> : <IconProgress />} Progress
                {!progressLoading && <span className="student-subjects-progress-count">{quizHistory.length}</span>}
              </button>
            )
          ) : (
            <button className="student-subjects-progress-btn" onClick={() => setView('topics')}>
              <IconTopics /> Topics
            </button>
          )
        )}
        filter={view === 'topics' && (
          <SubjectFilterBar
            subjects={subjects}
            activeSubjectId={activeSubjectId}
            onSelectSubject={setSelectedSubjectId}
            topicStatsById={topicStatsById}
          />
        )}
      />

      <Toast message={quizError} onDismiss={() => setQuizError('')} />

      {view === 'progress' ? (
        <div className="student-subjects-body student-subjects-body--progress">
          <StudentQuizProgress
            subjects={subjects}
            topicStatsById={topicStatsById}
            quizzes={quizHistory}
            quizHistoryStatus={quizHistoryStatus}
            quizHistoryError={quizHistoryError}
            onDismissQuizHistoryError={dismissQuizHistoryError}
            studentId={studentId}
          />
        </div>
      ) : (
        <SubjectTopicGrid
          subjects={subjects}
          activeSubjectId={activeSubjectId}
          topicStatsById={topicStatsById}
          readOnly={readOnly}
          onCardClick={topic => startQuiz(topic, 'card')}
          onPlayClick={topic => startQuiz(topic, 'play')}
          loadingQuiz={loadingQuiz}
          scoringTopics={scoringTopics}
        />
      )}
    </div>
  )
}
