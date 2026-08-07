import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useQuizProgressStore } from '../../store/quizProgressStore'
import { useQuizHistoryStore } from '../../store/quizHistoryStore'
import { fetchQuizStatus, startQuiz as fetchQuizQuestions } from '../../services/quizService'
import { Toast } from '../../components/ui/Toast'
import PageHeader from '../../components/PageHeader'
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

export default function StudentSubjectsHome() {
  const navigate = useNavigate()
  // subjects (and each subject's topics) already arrive alphabetically
  // sorted from the backend — see teach_log_service.list_subjects_taught.
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsError = useSubjectsTaughtStore(s => s.error)
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
  // topic_id -> quiz_id, for topics whose LLM scoring pass hasn't finished yet
  const [scoringTopics, setScoringTopics] = useState({})
  const [view, setView] = useState('topics') // 'topics' | 'progress'

  useEffect(() => { fetchQuizProgress() }, [fetchQuizProgress])
  // Fetched eagerly (not gated on the Progress click) so the button can show
  // a total-quizzes-played count across every subject as soon as the page loads.
  useEffect(() => { fetchQuizHistory() }, [fetchQuizHistory])

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
            setScoringTopics(prev => {
              const next = { ...prev }
              delete next[topicId]
              return next
            })
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
          if (result.pending_count > 0) {
            setScoringTopics(prev => ({ ...prev, [activeQuiz.topicId]: result.quiz_id }))
          } else {
            fetchQuizProgress()
          }
          refreshQuizHistory()
        }}
      />
    )
  }

  if (subjectsStatus === 'loading' || subjectsStatus === 'idle') {
    return (
      <div className="content-card">
        <p className="content-card-placeholder">Loading…</p>
      </div>
    )
  }

  if (subjectsStatus === 'error') {
    return (
      <div className="student-subjects content-card">
        <h2 className="content-card-title">Subjects</h2>
        <p className="student-subjects-error">{subjectsError}</p>
      </div>
    )
  }

  if (subjects.length === 0) {
    return (
      <div className="student-subjects content-card">
        <h2 className="content-card-title">Subjects</h2>
        <p className="content-card-placeholder">No subjects available for your grade yet.</p>
      </div>
    )
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
        title="Play"
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
          />
        </div>
      ) : (
        <SubjectTopicGrid
          subjects={subjects}
          activeSubjectId={activeSubjectId}
          topicStatsById={topicStatsById}
          onCardClick={topic => startQuiz(topic, 'card')}
          onPlayClick={topic => startQuiz(topic, 'play')}
          loadingQuiz={loadingQuiz}
          scoringTopics={scoringTopics}
        />
      )}
    </div>
  )
}
