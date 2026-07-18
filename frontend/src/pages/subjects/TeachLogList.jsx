import { useEffect, useRef, useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import QaCard from './QaCard'
import { getSubjectIcon } from './subjectIconMatch'
import TeachLogCalendar from './TeachLogCalendar'
import './TeachLogList.css'

function IconChevron({ open }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function IconHistory() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

function IconSpinner() {
  return (
    <svg className="teach-log-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M10.4 3.9 2.5 17.5a1.8 1.8 0 0 0 1.6 2.7h15.8a1.8 1.8 0 0 0 1.6-2.7L13.6 3.9a1.8 1.8 0 0 0-3.2 0Z" />
      <path d="M12 16.5h.01" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export default function TeachLogList({ onLogNew, initialSelection, onEmptyDayClick }) {
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const mostRecent = useSubjectsTaughtStore(s => s.mostRecent)
  const status = useSubjectsTaughtStore(s => s.status)
  const error = useSubjectsTaughtStore(s => s.error)
  const handleQaUpdated = useSubjectsTaughtStore(s => s.handleQaUpdated)
  const handleQaFlagged = useSubjectsTaughtStore(s => s.handleQaFlagged)
  const ensureQaLoaded = useSubjectsTaughtStore(s => s.ensureQaLoaded)
  const loadingQaKeys = useSubjectsTaughtStore(s => s.loadingQaKeys)
  const qaLoadErrors = useSubjectsTaughtStore(s => s.qaLoadErrors)
  const [expandedSubjectId, setExpandedSubjectId] = useState(initialSelection?.subjectId ?? null)
  const [selectedTopicId, setSelectedTopicId] = useState(initialSelection?.topicId ?? null)
  const [selectedGradeId, setSelectedGradeId] = useState(initialSelection?.gradeId ?? null)
  // The QA pane keeps rendering whatever topic/grade it last had loaded data
  // for, even after the user clicks a different topic — these only catch up
  // to selectedTopicId/selectedGradeId once that topic's qa_items are ready,
  // so the list never goes blank while a fetch is in flight.
  const [displayedTopicId, setDisplayedTopicId] = useState(initialSelection?.topicId ?? null)
  const [displayedGradeId, setDisplayedGradeId] = useState(initialSelection?.gradeId ?? null)
  const [showCalendar, setShowCalendar] = useState(false)
  // { key, topicId, gradeId, topicName, message } | null — set once when a
  // fetch fails, cleared on dismiss/retry/auto-timeout.
  const [toast, setToast] = useState(null)
  const qaScrollRef = useRef(null)

  // Keeping displayedTopicId/GradeId in sync with the selection (once its
  // fetch is no longer in flight) is an adjustment of derived state, not a
  // sync with an external system — done directly during render (React's
  // documented pattern for this) rather than in an effect, so it settles in
  // the same render pass instead of an extra effect-triggered one.
  const selKey = selectedTopicId != null && selectedGradeId != null ? `${selectedTopicId}:${selectedGradeId}` : null
  const selKeyLoading = selKey != null && loadingQaKeys.has(selKey)
  const selKeyError = selKey != null ? qaLoadErrors[selKey] : undefined
  const qaSyncSignal = `${selKey ?? 'none'}|${selKeyLoading}|${selKeyError ?? ''}`
  const [prevQaSyncSignal, setPrevQaSyncSignal] = useState(null)
  if (prevQaSyncSignal !== qaSyncSignal) {
    setPrevQaSyncSignal(qaSyncSignal)
    if (selKey == null) {
      setDisplayedTopicId(selectedTopicId)
      setDisplayedGradeId(selectedGradeId)
    } else if (!selKeyLoading) {
      if (selKeyError) {
        // The fetch for the newly-selected topic/grade failed — fall back
        // to whatever was displayed before, including the sidebar
        // selection, so the UI ends up exactly where it was rather than
        // pointed at a topic with no data. Surface the failure as a toast
        // rather than silently.
        const failedTopicName = subjects
          .flatMap(s => s.topics)
          .find(t => t.topic_id === selectedTopicId)?.topic_name
        if (displayedTopicId != null && displayedGradeId != null) {
          setSelectedTopicId(displayedTopicId)
          setSelectedGradeId(displayedGradeId)
          const displayedSubj = subjects.find(s => s.topics.some(t => t.topic_id === displayedTopicId))
          if (displayedSubj) setExpandedSubjectId(displayedSubj.subject_id)
        }
        setToast({ key: selKey, topicId: selectedTopicId, gradeId: selectedGradeId, topicName: failedTopicName, message: selKeyError })
      } else {
        setDisplayedTopicId(selectedTopicId)
        setDisplayedGradeId(selectedGradeId)
      }
    }
  }

  // Auto-dismiss the toast so a failure notice doesn't linger indefinitely
  // if the user ignores it.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  function retryToast() {
    if (!toast) return
    const { topicId, gradeId } = toast
    setToast(null)
    setSelectedTopicId(topicId)
    setSelectedGradeId(gradeId)
    const subj = subjects.find(s => s.topics.some(t => t.topic_id === topicId))
    if (subj) setExpandedSubjectId(subj.subject_id)
    ensureQaLoaded(topicId, gradeId)
  }

  // Switching to a topic/grade whose QA is actually displayed shows an
  // entirely different QA list — don't leave it scrolled to wherever the
  // previous list happened to be. Both ids are needed: two different topics
  // can share the same first grade_id, so grade alone can miss it.
  useEffect(() => {
    if (qaScrollRef.current) qaScrollRef.current.scrollTop = 0
  }, [displayedTopicId, displayedGradeId])

  // initialSelection (arriving right after generating QA) isn't guaranteed
  // to be the eagerly-loaded "most recent" grade — e.g. ties on the same
  // day — so make sure its qa_items are actually loaded, same as any other
  // topic/grade the user might click into.
  useEffect(() => {
    if (initialSelection?.topicId != null && initialSelection?.gradeId != null) {
      ensureQaLoaded(initialSelection.topicId, initialSelection.gradeId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-expand + auto-select the most-recently-taught topic/grade when
  // nothing was explicitly requested via initialSelection (e.g. arriving
  // fresh via "Topics Covered" rather than right after generating QA) —
  // land on the subject list with that topic's questions already showing.
  // Its qa_items are eagerly attached by the subjects-taught response, so
  // this never needs an on-demand fetch. The store is usually already
  // loaded (fetched at login), so this typically fires on the very first
  // render; the flag just guards against re-running it later if the store
  // data changes while the user has already navigated around. Done directly
  // during render (not in an effect) for the same reason as the QA sync
  // above — it's a one-time state adjustment, not a sync with an external
  // system.
  const [didAutoExpand, setDidAutoExpand] = useState(Boolean(initialSelection))
  if (!didAutoExpand && status === 'loaded') {
    setDidAutoExpand(true)
    if (mostRecent) {
      setExpandedSubjectId(mostRecent.subject_id)
      setSelectedTopicId(mostRecent.topic_id)
      setSelectedGradeId(mostRecent.grade_id)
    }
  }

  function toggleSubject(subjectId) {
    if (expandedSubjectId === subjectId) {
      setExpandedSubjectId(null)
      setSelectedTopicId(null)
      setSelectedGradeId(null)
    } else {
      setExpandedSubjectId(subjectId)
      const subject = subjects.find(s => s.subject_id === subjectId)
      const topicId = subject?.most_recent_topic_id
      const gradeId = subject?.most_recent_grade_id
      if (topicId != null && gradeId != null) {
        setSelectedTopicId(topicId)
        setSelectedGradeId(gradeId)
        ensureQaLoaded(topicId, gradeId)
      }
    }
  }

  function selectTopic(subjectId, topic) {
    setExpandedSubjectId(subjectId)
    setSelectedTopicId(topic.topic_id)
    const gradeId = topic.grades[0]?.grade_id ?? null
    setSelectedGradeId(gradeId)
    if (gradeId != null) ensureQaLoaded(topic.topic_id, gradeId)
  }

  function selectGrade(topicId, gradeId) {
    setSelectedGradeId(gradeId)
    ensureQaLoaded(topicId, gradeId)
  }

  const currentSubject = subjects.find(s => s.subject_id === expandedSubjectId)
  // Look up the displayed topic across all subjects (not just currentSubject)
  // so its stale data keeps rendering even if the sidebar has since expanded
  // a different subject while the new topic's QA is still loading.
  const displayedSubject = subjects.find(s => s.topics.some(t => t.topic_id === displayedTopicId)) ?? currentSubject
  const currentTopic = displayedSubject?.topics.find(t => t.topic_id === displayedTopicId)
  const currentGrade = currentTopic?.grades.find(g => g.grade_id === displayedGradeId)
  const isSwitchingQa = selectedTopicId !== displayedTopicId || selectedGradeId !== displayedGradeId

  return (
    <div className="teach-log-list">
      <div className="teach-log-list-header">
        <h2 className="teach-log-list-title">Subjects</h2>
        <div className="teach-log-list-header-actions">
          <button
            className={`teach-log-list-history-btn ${!showCalendar ? 'teach-log-list-history-btn--active' : ''}`}
            onClick={() => setShowCalendar(false)}
            aria-label="View subject list"
            title="View subject list"
          >
            <IconList />
          </button>
          <button
            className={`teach-log-list-history-btn ${showCalendar ? 'teach-log-list-history-btn--active' : ''}`}
            onClick={() => setShowCalendar(true)}
            aria-label="View log history"
            title="View log history"
          >
            <IconHistory />
          </button>
          <button className="teach-log-list-new-btn" onClick={onLogNew}>
            New Subject
          </button>
        </div>
      </div>

      {showCalendar && <TeachLogCalendar onEmptyDayClick={onEmptyDayClick} />}

      {!showCalendar && status === 'error' && <p className="teach-log-list-empty">{error}</p>}

      {!showCalendar && status === 'loaded' && subjects.length === 0 && (
        <p className="teach-log-list-empty">Nothing logged yet — log the first topic you taught today.</p>
      )}

      {!showCalendar && status === 'loaded' && subjects.length > 0 && (
        <div className="teach-log-columns">
          <div className="teach-log-subjects">
            {subjects.map(subject => {
              const isOpen = subject.subject_id === expandedSubjectId
              const SubjectIcon = getSubjectIcon(subject.subject_name, subject.icon_key)
              return (
                <div key={subject.subject_id} className="teach-log-subject-block">
                  <button
                    className="teach-log-subject-row"
                    onClick={() => toggleSubject(subject.subject_id)}
                  >
                    <SubjectIcon />
                    <span className="teach-log-subject-name">{subject.subject_name}</span>
                    <span className="teach-log-subject-count">{subject.topics.length}</span>
                    <IconChevron open={isOpen} />
                  </button>

                  {isOpen && subject.topics.map(topic => {
                    const qaCount = topic.grades.reduce((a, g) => a + g.qa_count, 0)
                    const isLoading = topic.grades.some(g => loadingQaKeys.has(`${topic.topic_id}:${g.grade_id}`))
                    return (
                      <button
                        key={topic.topic_id}
                        className={`teach-log-topic-row ${topic.topic_id === selectedTopicId ? 'teach-log-topic-row--active' : ''}`}
                        onClick={() => selectTopic(subject.subject_id, topic)}
                      >
                        <span className="teach-log-topic-name">{topic.topic_name}</span>
                        {isLoading ? <IconSpinner /> : <span className="teach-log-topic-count">{qaCount}</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="teach-log-detail">
            {currentTopic && (
              <>
                <div className="teach-log-filter-row">
                  {currentTopic.grades.map(g => (
                    <button
                      key={g.grade_id}
                      className={`teach-log-grade-pill ${g.grade_id === displayedGradeId ? 'teach-log-grade-pill--active' : ''}`}
                      onClick={() => selectGrade(currentTopic.topic_id, g.grade_id)}
                    >
                      {g.grade_name}
                    </button>
                  ))}
                </div>

                <div className="teach-log-qa-scroll-wrap">
                  <div className="teach-log-qa-scroll" ref={qaScrollRef}>
                    {currentGrade?.qa_items?.length === 0 && (
                      <p className="teach-log-list-empty">No questions generated for this grade yet.</p>
                    )}

                    {currentGrade?.qa_items?.map(qa => (
                      <QaCard key={qa.qa_id} qa={qa} onUpdated={handleQaUpdated} onFlagged={handleQaFlagged} />
                    ))}
                  </div>

                  {isSwitchingQa && (
                    <div className="teach-log-qa-overlay">
                      <IconSpinner />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="teach-log-toast" role="alert">
          <IconAlert />
          <span className="teach-log-toast-message">
            Couldn't load questions{toast.topicName ? ` for "${toast.topicName}"` : ''}. {toast.message}
          </span>
          <button className="teach-log-toast-retry" onClick={retryToast}>Retry</button>
          <button className="teach-log-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">
            <IconClose />
          </button>
        </div>
      )}
    </div>
  )
}
