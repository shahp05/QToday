import { useState } from 'react'
import MathText from '../../components/MathText'
import { scoreColor, scoreTextColor } from '../../lib/scoreColor'
import { challengeQuizQuestion } from '../../services/quizService'
import './QaCard.css'
import './StudentQuizQaItem.css'

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconSpinner() {
  return <span className="qa-card-spinner" role="status" aria-label="Working" />
}

// MCQ items carry an options object; true/false doesn't, so synthesize one
// here to render both the same way — same pattern as QaCard.getRenderOptions.
function getRenderOptions(q) {
  if (q.options) return q.options
  if (q.question_type === 'true_false') return { T: 'True', F: 'False' }
  return null
}

// Read-only counterpart to QaCard for a played quiz's question: same
// `.qa-card`/`.qa-card-options` visual language (lettered option pills,
// green highlight on the correct one), swapping the edit/flag actions row
// for a per-question score badge, tick/cross correctness markers, and a
// challenge form for anything short of full marks.
export default function StudentQuizQaItem({ q, quizId }) {
  const renderOptions = getRenderOptions(q)
  const isMcq = !!q.options
  const isFullMarks = q.is_scored && q.score === q.marks
  const isAnswered = q.student_response != null && q.student_response !== ''
  const canChallenge = q.is_scored && !isFullMarks && isAnswered

  const [challenged, setChallenged] = useState(q.challenged)
  const [challenging, setChallenging] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmitChallenge() {
    if (!reason.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await challengeQuizQuestion(quizId, q.qa_id, reason.trim())
      setChallenged(true)
      setChallenging(false)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="qa-card student-quiz-qa-card">
      <div className="qa-card-question-row">
        <MathText className="qa-card-question" text={q.question} />
        <span
          className={`student-quiz-qa-score${q.is_scored ? ' student-quiz-qa-score--scored' : ''}`}
          style={q.is_scored
            ? { background: scoreColor(Math.round((q.score / q.marks) * 100)), color: scoreTextColor(Math.round((q.score / q.marks) * 100)) }
            : undefined}
        >
          {q.is_scored ? `${q.score}/${q.marks}` : 'Scoring…'}
        </span>
      </div>

      {renderOptions ? (
        <ul className="qa-card-options">
          {Object.entries(renderOptions).map(([key, text]) => {
            const isCorrectOption = isMcq
              ? q.answer.toLowerCase().split(',').includes(key.toLowerCase())
              : q.answer.toLowerCase() === text.toLowerCase()
            const isStudentPick = q.student_response != null && key.toLowerCase() === q.student_response.toLowerCase()
            let modifier = ''
            let content = key.toUpperCase()
            if (isStudentPick && q.is_scored) {
              if (isCorrectOption) {
                modifier = ' qa-card-option-label--correct'
                content = <IconCheck />
              } else {
                modifier = ' student-quiz-option-label--incorrect'
                content = <IconX />
              }
            } else if (isCorrectOption && q.is_scored) {
              modifier = ' qa-card-option-label--correct'
            } else if (isStudentPick) {
              modifier = ' student-quiz-option-label--pending'
            }
            return (
              <li key={key}>
                <span className={`qa-card-option-label${modifier}`}>{content}</span>
                <MathText text={text} />
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="student-quiz-qa-descriptive">
          {q.is_scored ? (
            <div className="student-quiz-qa-answer-row">
              <span className={`qa-card-option-label${isFullMarks ? ' qa-card-option-label--correct' : ' student-quiz-option-label--incorrect'}`}>
                {isFullMarks ? <IconCheck /> : <IconX />}
              </span>
              <MathText text={q.student_response || 'Not answered'} />
            </div>
          ) : (
            <p className="qa-card-answer student-quiz-qa-pending">
              {q.student_response ? <>Answer: <MathText text={q.student_response} /></> : 'Not answered'} · Scoring…
            </p>
          )}
          {q.is_scored && !isFullMarks && (
            <div className="student-quiz-qa-answer-row">
              <span className="qa-card-option-label qa-card-option-label--correct"><IconCheck /></span>
              <MathText text={q.answer} />
            </div>
          )}
        </div>
      )}

      {canChallenge && (
        <div className="qa-card-actions-row student-quiz-qa-actions">
          {challenged ? (
            <span className="student-quiz-qa-challenged-tag">Challenge submitted</span>
          ) : challenging ? (
            <div className="student-quiz-qa-challenge">
              <input
                type="text"
                className="student-quiz-qa-challenge-input"
                placeholder="Why do you think this is wrong?"
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={submitting}
                autoFocus
              />
              <div className="qa-card-actions-row">
                <button className="qa-card-pill qa-card-pill--save" onClick={handleSubmitChallenge} disabled={submitting || !reason.trim()}>
                  <span style={{ visibility: submitting ? 'hidden' : 'visible' }}>Submit</span>
                  {submitting && (
                    <span className="qa-card-pill-spinner-overlay">
                      <IconSpinner />
                    </span>
                  )}
                </button>
                <button
                  className="qa-card-pill qa-card-pill--cancel"
                  onClick={() => { setChallenging(false); setReason(''); setSubmitError('') }}
                  disabled={submitting}
                  aria-label="Cancel"
                >
                  <IconX />
                </button>
              </div>
            </div>
          ) : (
            <button className="qa-card-pill qa-card-pill--flag" onClick={() => setChallenging(true)}>
              Challenge
            </button>
          )}
        </div>
      )}

      {submitError && <p className="qa-card-error">{submitError}</p>}
    </div>
  )
}
