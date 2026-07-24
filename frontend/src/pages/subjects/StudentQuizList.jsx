import { useEffect, useState } from 'react'
import { scoreColor } from '../../lib/scoreColor'
import { Toast } from '../../components/ui/Toast'
import { fetchQuizDetail } from '../../services/quizService'
import StudentQuizQaItem from './StudentQuizQaItem'
import './StudentQuizList.css'

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function IconChevron({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

// quizzes: already filtered to the selected subject/topic, newest first.
// Each quiz carries its own grade_name (the grade it was actually played
// at, snapshotted server-side on submit) — not the student's current
// grade, since a topic can be replayed across grades over time.
// autoExpandKey: changes whenever the caller switches to a different topic —
// triggers auto-opening the most recent (first) scored quiz in `quizzes`.
export default function StudentQuizList({ quizzes, status, error, onDismissError, autoExpandKey }) {
  // Single-open accordion (matches TeachLogList.jsx's subject-row pattern) —
  // expanding a quiz collapses whichever one was open before it.
  const [expandedQuizId, setExpandedQuizId] = useState(null)
  const [detail, setDetail] = useState(null) // fetchQuizDetail() result for expandedQuizId, or null while loading
  const [detailStatus, setDetailStatus] = useState('idle') // idle | loading | loaded | error
  const [detailError, setDetailError] = useState('')

  async function openQuiz(quiz) {
    setExpandedQuizId(quiz.quiz_id)
    setDetail(null)
    setDetailStatus('loading')
    setDetailError('')
    try {
      const data = await fetchQuizDetail(quiz.quiz_id)
      setDetail(data)
      setDetailStatus('loaded')
    } catch (err) {
      setDetailError(err.message)
      setDetailStatus('error')
    }
  }

  function toggleQuiz(quiz) {
    if (!quiz.is_scored) return
    if (expandedQuizId === quiz.quiz_id) {
      setExpandedQuizId(null)
      return
    }
    openQuiz(quiz)
  }

  useEffect(() => {
    if (autoExpandKey == null) return
    const mostRecent = quizzes[0]
    if (mostRecent?.is_scored) {
      openQuiz(mostRecent)
    } else {
      setExpandedQuizId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExpandKey])

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="student-quiz-list-loading">
        <span className="student-topic-spinner student-topic-spinner--lg" />
      </div>
    )
  }

  if (status === 'error') {
    return <Toast message={error} onDismiss={onDismissError} />
  }

  if (quizzes.length === 0) {
    return <p className="content-card-placeholder">No quizzes played for this subject yet.</p>
  }

  return (
    <div className="student-quiz-list">
      {quizzes.map(quiz => {
        const pct = quiz.is_scored ? Math.round((quiz.total_score / quiz.total_marks) * 100) : null
        const isOpen = quiz.quiz_id === expandedQuizId
        return (
          <div key={quiz.quiz_id} className="student-quiz-block">
            <button
              className={`student-quiz-row ${quiz.is_scored ? '' : 'student-quiz-row--pending'}`}
              onClick={() => toggleQuiz(quiz)}
              disabled={!quiz.is_scored}
            >
              {quiz.is_scored ? (
                <span className="student-quiz-score" style={{ background: scoreColor(pct) }}>{pct}%</span>
              ) : (
                <span className="student-quiz-score student-quiz-score--pending"><IconClock /></span>
              )}
              <div className="student-quiz-row-info">
                <p className="student-quiz-row-topic">{quiz.topic_name}</p>
                <p className="student-quiz-row-meta">
                  {quiz.grade_name ? `Grade ${quiz.grade_name} · ` : ''}
                  {formatDate(quiz.date_created)}
                  {!quiz.is_scored && ' · Scoring in progress'}
                </p>
              </div>
              {quiz.is_scored && <IconChevron open={isOpen} />}
            </button>

            {isOpen && (
              <div className="student-quiz-detail">
                {detailStatus === 'loading' && (
                  <div className="student-quiz-list-loading">
                    <span className="student-topic-spinner student-topic-spinner--lg" />
                  </div>
                )}
                {detailStatus === 'error' && (
                  <Toast message={detailError} onDismiss={() => setExpandedQuizId(null)} />
                )}
                {detailStatus === 'loaded' && detail && (
                  <div className="student-quiz-detail-list">
                    {detail.questions.map(q => <StudentQuizQaItem key={q.qa_id} q={q} quizId={quiz.quiz_id} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
