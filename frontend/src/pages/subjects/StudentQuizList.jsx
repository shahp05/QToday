import { useState } from 'react'
import { scoreColor, scoreTextColor } from '../../lib/scoreColor'
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
// autoExpandKey: changes whenever the caller switches to a different topic.
// Passed as the accordion's key rather than watched in an effect — a fresh
// key remounts StudentQuizAccordion with its state reset to initial values,
// collapsing whatever was open (which belonged to the previous topic's
// list) without a setState-in-effect render pass.
// readOnly: teacher-viewing-a-student mode — GET /quizzes/{id}/detail is
// gated to the student themselves (see backend's _resolve_own_student_id),
// so expand-to-see-answers isn't available for another viewer; rows still
// show the score/date/topic summary, just aren't clickable.
export default function StudentQuizList({ quizzes, status, error, onDismissError, autoExpandKey, readOnly = false }) {
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

  return <StudentQuizAccordion key={autoExpandKey} quizzes={quizzes} readOnly={readOnly} />
}

// Single-open accordion (matches TeachLogList.jsx's subject-row pattern) —
// expanding a quiz collapses whichever one was open before it. The row only
// opens once its detail has actually loaded — loadingQuizId drives a spinner
// in the row header instead, so the body never expands empty and then pops
// content in underneath the spinner.
function StudentQuizAccordion({ quizzes, readOnly }) {
  const [expandedQuizId, setExpandedQuizId] = useState(null)
  const [detail, setDetail] = useState(null) // fetchQuizDetail() result for expandedQuizId
  const [loadingQuizId, setLoadingQuizId] = useState(null)
  const [detailError, setDetailError] = useState('')

  async function openQuiz(quiz) {
    setLoadingQuizId(quiz.quiz_id)
    setDetailError('')
    try {
      const data = await fetchQuizDetail(quiz.quiz_id)
      setDetail(data)
      setExpandedQuizId(quiz.quiz_id)
    } catch (err) {
      setDetailError(err.message)
    } finally {
      setLoadingQuizId(null)
    }
  }

  function toggleQuiz(quiz) {
    if (readOnly || !quiz.is_scored || loadingQuizId) return
    if (expandedQuizId === quiz.quiz_id) {
      setExpandedQuizId(null)
      return
    }
    openQuiz(quiz)
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
              disabled={!quiz.is_scored || readOnly}
            >
              {quiz.is_scored ? (
                <span className="student-quiz-score" style={{ background: scoreColor(pct), color: scoreTextColor(pct) }}>{pct}%</span>
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
              {quiz.is_scored && !readOnly && <IconChevron open={isOpen} />}
            </button>

            {!readOnly && loadingQuizId === quiz.quiz_id && (
              <div className="student-quiz-row-overlay">
                <span className="student-topic-spinner student-topic-spinner--lg" />
              </div>
            )}

            {!readOnly && isOpen && detail && (
              <div className="student-quiz-detail">
                <div className="student-quiz-detail-list">
                  {detail.questions.map(q => (
                    <StudentQuizQaItem
                      key={q.qa_id}
                      q={q}
                      quizId={quiz.quiz_id}
                      onChallengeResolved={result => {
                        setDetail(prev => ({
                          ...prev,
                          total_score: result.total_score,
                          questions: prev.questions.map(pq => pq.qa_id === q.qa_id
                            ? {
                              ...pq,
                              score: result.score,
                              answer: result.answer,
                              challenge_reason: result.challenge_reason,
                              challenge_response: result.challenge_response,
                            }
                            : pq),
                        }))
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {detailError && <Toast message={detailError} onDismiss={() => setDetailError('')} />}
    </div>
  )
}
