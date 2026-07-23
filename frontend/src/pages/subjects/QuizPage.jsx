import { useEffect, useRef, useState } from 'react'
import MathText from '../../components/MathText'
import './QuizPage.css'

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// MCQ items carry an options object; true/false doesn't, so synthesize one
// here to render both the same way — same pattern as QaCard.getRenderOptions.
function getRenderOptions(qa) {
  if (qa.options) return qa.options
  if (qa.question_type === 'true_false') return { T: 'True', F: 'False' }
  return null
}

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Question-taking flow only — real scoring is deferred, so finalizeQuiz
// simulates an evaluation delay and a placeholder score, then hands a
// result object back to onExit for the caller to display. Questions (and
// total_marks) are fetched by the caller (StudentSubjectsHome), which owns
// the loading spinner shown while this component isn't mounted yet.
export default function QuizPage({ subjectName, topicName, questions, totalMarks, onExit }) {
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [totalSeconds, setTotalSeconds] = useState(0)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [evaluating, setEvaluating] = useState(false)

  const quizStartRef = useRef(null)
  const questionStartRef = useRef(null)
  // qa_id -> accumulated seconds — tracked even though only the running
  // total is shown; per-question time is what the intro message promises
  // gets "recorded", for later scoring/analytics once submission is wired up.
  const perQuestionSecondsRef = useRef({})

  // Runs once Start Now is clicked, before the ticking effect below (effects
  // fire in declaration order within the same commit) — Date.now() is
  // impure, so it can only be read here, never during render.
  useEffect(() => {
    if (!started) return
    const now = Date.now()
    quizStartRef.current = now
    questionStartRef.current = now
  }, [started])

  // Ticks the total-time display once a second — reads refs from an effect
  // (not render), which is the only place that's safe to do so.
  useEffect(() => {
    if (!started || questions.length === 0 || reviewing || evaluating) return
    function tick() {
      setTotalSeconds(Math.round((Date.now() - quizStartRef.current) / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [started, questions, reviewing, evaluating])

  function commitQuestionTime(qaId) {
    if (questionStartRef.current == null) return
    const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000)
    perQuestionSecondsRef.current[qaId] = (perQuestionSecondsRef.current[qaId] || 0) + elapsed
    questionStartRef.current = Date.now()
  }

  function goTo(newIndex) {
    commitQuestionTime(questions[index].qa_id)
    setIndex(newIndex)
    setConfirmQuit(false)
  }

  function handleAnswer(qaId, value) {
    setAnswers(prev => ({ ...prev, [qaId]: value }))
  }

  // Scans the other n-1 questions (never fromIndex itself) in the given
  // direction, wrapping around the ends, and returns the first one without
  // an answer — or -1 if every other question is already answered.
  function findUnansweredFrom(fromIndex, direction) {
    const n = questions.length
    for (let step = 1; step < n; step++) {
      const i = ((fromIndex + direction * step) % n + n) % n
      if (answers[questions[i].qa_id] === undefined) return i
    }
    return -1
  }

  // MCQ/true-false only — picking an option is a single decisive action, so
  // it advances automatically to the next unanswered question. Descriptive
  // answers stay put since typing is ongoing and there's no equivalent
  // "done" moment to trigger on; those rely on Prev/Next instead.
  function handleSelectOption(qaId, value) {
    handleAnswer(qaId, value)
    const nextIndex = findUnansweredFrom(index, 1)
    if (nextIndex !== -1) {
      goTo(nextIndex)
    }
  }

  // Ends the quiz: shows a spinner on whichever button triggered it, waits
  // out a placeholder "evaluating" delay, then returns to the topic-cards
  // page. No backend to grade against yet, so nothing is scored or shown
  // here — the score display gets built once evaluation is wired up.
  function finalizeQuiz() {
    commitQuestionTime(questions[index].qa_id)
    setEvaluating(true)
    setTimeout(onExit, 1400)
  }

  // Done only finalizes outright when every question already has an answer;
  // otherwise it opens the review screen so the student can see how much is
  // left before deciding whether to go back or submit as-is.
  function handleDoneClick() {
    if (Object.keys(answers).length === questions.length) {
      finalizeQuiz()
    } else {
      commitQuestionTime(questions[index].qa_id)
      setReviewing(true)
    }
  }

  function handleStartOver() {
    setIndex(0)
    setReviewing(false)
  }

  function handleContinueUnanswered() {
    const nextIndex = questions.findIndex(qq => answers[qq.qa_id] === undefined)
    setIndex(nextIndex === -1 ? 0 : nextIndex)
    setReviewing(false)
  }

  function handleQuitClick() {
    if (confirmQuit) {
      onExit()
    } else {
      setConfirmQuit(true)
    }
  }

  if (questions.length === 0) {
    return (
      <div className="quiz-page">
        <div className="quiz-center">
          <div className="quiz-page-message content-card">
            <p className="content-card-placeholder">No questions available for this topic yet.</p>
            <button className="quiz-exit-btn" onClick={onExit}>Back to topics</button>
          </div>
        </div>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="quiz-page">
        <div className="quiz-center">
          <div className="quiz-intro">
            <h2 className="quiz-intro-subject">{subjectName}</h2>
            <p className="quiz-intro-message">
              Play <span className="quiz-intro-accent">{questions.length}</span> questions on{' '}
              <span className="quiz-intro-accent">{topicName}</span> to score a total of{' '}
              <span className="quiz-intro-accent">{totalMarks}</span> points. The time you spend on
              each question will be recorded and applied to map your performance. If you change the
              tab/page, it will be recorded too.
            </p>
            <div className="quiz-intro-actions">
              <button className="quiz-btn quiz-intro-back-btn" onClick={onExit}>Back</button>
              <button className="quiz-btn quiz-intro-start-btn" onClick={() => setStarted(true)}>Start Now</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (reviewing) {
    const answeredCount = Object.keys(answers).length
    const noneAnswered = answeredCount === 0
    return (
      <div className="quiz-page">
        <div className="quiz-taking-wrap">
          <div className="quiz-card quiz-card--auto">
            <div className="quiz-card-header">
              <div className="quiz-card-header-top">
                <div className="quiz-taking-header-info">
                  <p className="quiz-taking-subject">{subjectName}</p>
                  <p className="quiz-taking-topic">{topicName}</p>
                </div>
                <div className="quiz-quit-wrap">
                  {confirmQuit && <div className="quiz-quit-confirm">Sure you want to quit?</div>}
                  <button className="quiz-quit-icon-btn" onClick={handleQuitClick} aria-label="Quit quiz">
                    <IconClose />
                  </button>
                </div>
              </div>

              <div className="quiz-status-row">
                <div className="quiz-progress-dots">
                  {questions.map((_, i) => (
                    <span key={i} className={`quiz-progress-dot${i <= index ? ' quiz-progress-dot--done' : ''}`} />
                  ))}
                </div>
                <div className="quiz-status-meta">
                  Answered {answeredCount} of {questions.length} &middot; {formatDuration(totalSeconds)}
                </div>
              </div>
            </div>

            <div className="quiz-card-body">
              <div className="quiz-qa-panel quiz-qa-panel--alert">
                <div className="quiz-question-zone">
                  <p className="quiz-question-label quiz-question-label--alert">
                    {noneAnswered
                      ? "You haven't answered any questions on this topic. Start from the first question now, or revise the topic and play another time."
                      : `You have answered ${answeredCount} out of ${questions.length} questions. You can retry the remaining questions, or submit incomplete quiz as-is.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="quiz-card-footer">
              <div className="quiz-intro-actions">
                {noneAnswered ? (
                  <>
                    <button className="quiz-btn quiz-intro-back-btn" onClick={onExit} disabled={evaluating}>Play Later</button>
                    <button className="quiz-btn quiz-intro-start-btn" onClick={handleStartOver} disabled={evaluating}>Start Over</button>
                  </>
                ) : (
                  <>
                    <button className="quiz-btn quiz-intro-back-btn" onClick={handleContinueUnanswered} disabled={evaluating}>Retry {questions.length - answeredCount}</button>
                    <button className="quiz-btn quiz-intro-start-btn" onClick={finalizeQuiz} disabled={evaluating}>
                      {evaluating ? <span className="quiz-btn-spinner" /> : <IconCheck />} Submit As-is
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const q = questions[index]
  const renderOptions = getRenderOptions(q)
  const answeredCount = Object.keys(answers).length
  const isLast = index === questions.length - 1

  return (
    <div className="quiz-page">
      <div className="quiz-taking-wrap">
        <div className="quiz-card">
          <div className="quiz-card-header">
            <div className="quiz-card-header-top">
              <div className="quiz-taking-header-info">
                <p className="quiz-taking-subject">{subjectName}</p>
                <p className="quiz-taking-topic">{topicName}</p>
              </div>
              <div className="quiz-quit-wrap">
                {confirmQuit && <div className="quiz-quit-confirm">Sure you want to quit?</div>}
                <button className="quiz-quit-icon-btn" onClick={handleQuitClick} aria-label="Quit quiz">
                  <IconClose />
                </button>
              </div>
            </div>

            <div className="quiz-status-row">
              <div className="quiz-progress-dots">
                {questions.map((_, i) => (
                  <span key={i} className={`quiz-progress-dot${i <= index ? ' quiz-progress-dot--done' : ''}`} />
                ))}
              </div>
              <div className="quiz-status-meta">
                Answered {answeredCount} of {questions.length} &middot; {formatDuration(totalSeconds)}
              </div>
            </div>
          </div>

          <div className="quiz-card-body">
            <div className="quiz-qa-panel">
              <div className="quiz-question-zone">
                <MathText className="quiz-question-label" text={q.question} />
              </div>

              <div className="quiz-answer-zone">
                {renderOptions ? (
                  <ul className="quiz-options">
                    {Object.entries(renderOptions).map(([key, text]) => (
                      <li
                        key={key}
                        className={`quiz-option-item${answers[q.qa_id] === key ? ' quiz-option-item--selected' : ''}`}
                        onClick={() => handleSelectOption(q.qa_id, key)}
                      >
                        <button
                          type="button"
                          className={`quiz-option-key${answers[q.qa_id] === key ? ' quiz-option-key--selected' : ''}`}
                          onClick={() => handleSelectOption(q.qa_id, key)}
                          aria-label={`Select option ${key.toUpperCase()}`}
                        >
                          {key.toUpperCase()}
                        </button>
                        <MathText text={text} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <textarea
                    className="quiz-descriptive-input"
                    value={answers[q.qa_id] || ''}
                    onChange={e => handleAnswer(q.qa_id, e.target.value)}
                    placeholder="Type your answer…"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="quiz-card-footer">
            <div className="quiz-nav-row">
              <button className="quiz-btn quiz-nav-btn" onClick={() => goTo(index - 1)} disabled={index === 0 || evaluating} aria-label="Previous question">
                <IconChevronLeft />
              </button>
              <button
                className={`quiz-btn quiz-nav-btn quiz-nav-btn--submit${answeredCount === questions.length ? ' quiz-nav-btn--submit-ready' : ''}`}
                onClick={handleDoneClick}
                disabled={evaluating}
              >
                {evaluating ? <span className="quiz-btn-spinner" /> : <IconCheck />} Done
              </button>
              <button className="quiz-btn quiz-nav-btn" onClick={() => goTo(index + 1)} disabled={isLast || evaluating} aria-label="Next question">
                <IconChevronRight />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
