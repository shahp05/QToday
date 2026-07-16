import { useEffect, useRef, useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import QaCard from './QaCard'
import { getSubjectIcon } from './subjectIcons'
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

export default function TeachLogList({ onLogNew, initialSelection, onEmptyDayClick }) {
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const mostRecent = useSubjectsTaughtStore(s => s.mostRecent)
  const status = useSubjectsTaughtStore(s => s.status)
  const error = useSubjectsTaughtStore(s => s.error)
  const handleQaUpdated = useSubjectsTaughtStore(s => s.handleQaUpdated)
  const handleQaFlagged = useSubjectsTaughtStore(s => s.handleQaFlagged)
  const ensureQaLoaded = useSubjectsTaughtStore(s => s.ensureQaLoaded)
  const loadingQaKeys = useSubjectsTaughtStore(s => s.loadingQaKeys)
  const [expandedSubjectId, setExpandedSubjectId] = useState(initialSelection?.subjectId ?? null)
  const [selectedTopicId, setSelectedTopicId] = useState(initialSelection?.topicId ?? null)
  const [selectedGradeId, setSelectedGradeId] = useState(initialSelection?.gradeId ?? null)
  const [showCalendar, setShowCalendar] = useState(false)
  const qaScrollRef = useRef(null)

  // Switching subject/topic/grade shows an entirely different QA list —
  // don't leave it scrolled to wherever the previous list happened to be.
  // Both selectedTopicId and selectedGradeId are needed: two different
  // topics can share the same first grade_id, so grade alone can miss it.
  useEffect(() => {
    if (qaScrollRef.current) qaScrollRef.current.scrollTop = 0
  }, [selectedTopicId, selectedGradeId])

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
  // render; the ref just guards against re-running it later if the store
  // data changes while the user has already navigated around.
  const didAutoExpand = useRef(Boolean(initialSelection))
  useEffect(() => {
    if (didAutoExpand.current || status !== 'loaded') return
    didAutoExpand.current = true
    if (mostRecent) {
      setExpandedSubjectId(mostRecent.subject_id)
      setSelectedTopicId(mostRecent.topic_id)
      setSelectedGradeId(mostRecent.grade_id)
    }
  }, [status, mostRecent])

  function toggleSubject(subjectId) {
    if (expandedSubjectId === subjectId) {
      setExpandedSubjectId(null)
      setSelectedTopicId(null)
      setSelectedGradeId(null)
    } else {
      setExpandedSubjectId(subjectId)
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
  const currentTopic = currentSubject?.topics.find(t => t.topic_id === selectedTopicId)
  const currentGrade = currentTopic?.grades.find(g => g.grade_id === selectedGradeId)

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
                      className={`teach-log-grade-pill ${g.grade_id === selectedGradeId ? 'teach-log-grade-pill--active' : ''}`}
                      onClick={() => selectGrade(currentTopic.topic_id, g.grade_id)}
                    >
                      {g.grade_name}
                    </button>
                  ))}
                </div>

                <div className="teach-log-qa-scroll" ref={qaScrollRef}>
                  {currentGrade?.qa_items?.length === 0 && (
                    <p className="teach-log-list-empty">No questions generated for this grade yet.</p>
                  )}

                  {currentGrade?.qa_items?.map(qa => (
                    <QaCard key={qa.qa_id} qa={qa} onUpdated={handleQaUpdated} onFlagged={handleQaFlagged} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
