import { useEffect, useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useQuizProgressStore } from '../../store/quizProgressStore'
import { fetchQuizStatus, startQuiz as fetchQuizQuestions } from '../../services/quizService'
import { scoreColor } from '../../lib/scoreColor'
import { getSubjectIcon } from './subjectIconMatch'
import Dropdown from '../../components/Dropdown'
import QuizPage from './QuizPage'
import './StudentSubjectsHome.css'

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

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

const NOT_ATTEMPTED = { student_avg_pct: 0, max_score_pct: 0, last_played: null, attempts: 0 }

function formatLastPlayed(isoDate) {
  if (!isoDate) return 'Not attempted yet'
  const date = new Date(`${isoDate}T00:00:00`)
  return `Last played ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export default function StudentSubjectsHome() {
  // subjects (and each subject's topics) already arrive alphabetically
  // sorted from the backend — see teach_log_service.list_subjects_taught.
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsError = useSubjectsTaughtStore(s => s.error)
  const topicStatsById = useQuizProgressStore(s => s.topicStatsById)
  const fetchQuizProgress = useQuizProgressStore(s => s.fetchQuizProgress)
  const [selectedSubjectId, setSelectedSubjectId] = useState(null)
  const [activeQuiz, setActiveQuiz] = useState(null) // { topicId, gradeId, subjectName, topicName, questions, totalMarks } | null
  const [loadingQuiz, setLoadingQuiz] = useState(null) // { topicId, source: 'play' | 'card' } | null
  const [quizError, setQuizError] = useState('')
  // topic_id -> quiz_id, for topics whose LLM scoring pass hasn't finished yet
  const [scoringTopics, setScoringTopics] = useState({})

  useEffect(() => { fetchQuizProgress() }, [fetchQuizProgress])

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
          }
        } catch {
          // transient network/poll failure — try again next tick
        }
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [scoringTopics, fetchQuizProgress])

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
        }}
      />
    )
  }

  // Dashboard.jsx already holds this page off-screen until subjectsStatus
  // settles (see its panel-swap gate), so 'loading'/'idle' shouldn't reach
  // here in practice — rendering nothing rather than a placeholder is just
  // a safety net against a stale render slipping through that gate.
  if (subjectsStatus === 'loading' || subjectsStatus === 'idle') {
    return null
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

  const subjectOptions = subjects.map(s => {
    const Icon = getSubjectIcon(s.subject_name, s.icon_key)
    return { key: s.subject_id, label: s.subject_name, icon: <Icon /> }
  })

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
      <div className="student-subjects-header">
        <h2 className="student-subjects-title">Play</h2>
        <div className="student-subjects-header-actions">
          <button className="student-subjects-progress-btn" disabled title="Coming soon">
            <IconProgress /> Progress
          </button>
        </div>
      </div>

      {quizError && <p className="student-subjects-error">{quizError}</p>}

      <div className="student-subjects-bar">
        <Dropdown
          className="student-subjects-dropdown"
          value={activeSubjectId}
          options={subjectOptions}
          onChange={key => setSelectedSubjectId(key)}
        />
      </div>

      <div className="student-subjects-body">
        <div className="student-topic-grid">
          {activeSubject.topics.map((topic, index) => {
            const stats = topicStatsById[topic.topic_id] ?? NOT_ATTEMPTED
            const isLoadingThis = loadingQuiz?.topicId === topic.topic_id
            const isScoringThis = !!scoringTopics[topic.topic_id]
            return (
              <div
                key={topic.topic_id}
                className="student-topic-card"
                role="button"
                tabIndex={0}
                onClick={() => startQuiz(topic, 'card')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startQuiz(topic, 'card') } }}
              >
                <div className="student-topic-card-header">
                  <span className="student-topic-seq" style={{ background: scoreColor(stats.student_avg_pct) }}>{index + 1}</span>
                  <h3 className="student-topic-card-name">{topic.topic_name}</h3>
                </div>

                <div className="student-topic-progress">
                  <div className="student-topic-progress-row">
                    <span className="student-topic-progress-label">Your average</span>
                    <div className="student-topic-progress-track">
                      <div className="student-topic-progress-fill" style={{ width: `${stats.student_avg_pct}%`, background: scoreColor(stats.student_avg_pct) }} />
                    </div>
                    <span className="student-topic-progress-value">{stats.student_avg_pct}%</span>
                  </div>
                  <div className="student-topic-progress-row">
                    <span className="student-topic-progress-label">Class best</span>
                    <div className="student-topic-progress-track">
                      <div className="student-topic-progress-fill" style={{ width: `${stats.max_score_pct}%`, background: scoreColor(stats.max_score_pct) }} />
                    </div>
                    <span className="student-topic-progress-value">{stats.max_score_pct}%</span>
                  </div>
                  <p className="student-topic-last-played">{formatLastPlayed(stats.last_played)}</p>
                </div>

                <div className="student-topic-actions">
                  <button
                    className="student-topic-play-btn"
                    onClick={e => { e.stopPropagation(); startQuiz(topic, 'play') }}
                    aria-label={`Play ${topic.topic_name} quiz`}
                    disabled={!!loadingQuiz || isScoringThis}
                  >
                    {isLoadingThis && loadingQuiz.source === 'play' ? <span className="student-topic-spinner" /> : <IconPlay />}
                  </button>
                </div>

                {isLoadingThis && loadingQuiz.source === 'card' && (
                  <div className="student-topic-card-overlay">
                    <span className="student-topic-spinner student-topic-spinner--lg" />
                  </div>
                )}

                {isScoringThis && (
                  <div className="student-topic-card-overlay">
                    <span className="student-topic-scoring-label">
                      <span className="student-topic-spinner" /> Scoring…
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
