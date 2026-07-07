import { useEffect, useRef, useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import QaCard from './QaCard'
import './TeachLogList.css'

function IconBook() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function IconChevron({ open }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export default function TeachLogList({ onLogNew }) {
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const status = useSubjectsTaughtStore(s => s.status)
  const error = useSubjectsTaughtStore(s => s.error)
  const handleQaUpdated = useSubjectsTaughtStore(s => s.handleQaUpdated)
  const handleQaFlagged = useSubjectsTaughtStore(s => s.handleQaFlagged)
  const [expandedSubjectId, setExpandedSubjectId] = useState(null)
  const [selectedTopicId, setSelectedTopicId] = useState(null)
  const [selectedGradeId, setSelectedGradeId] = useState(null)
  const qaScrollRef = useRef(null)

  // Switching subject/topic/grade shows an entirely different QA list —
  // don't leave it scrolled to wherever the previous list happened to be.
  // Both selectedTopicId and selectedGradeId are needed: two different
  // topics can share the same first grade_id, so grade alone can miss it.
  useEffect(() => {
    if (qaScrollRef.current) qaScrollRef.current.scrollTop = 0
  }, [selectedTopicId, selectedGradeId])

  // Auto-expand + auto-select the first topic when there's only one subject
  // — nothing to choose between, so skip straight to it. The store is
  // usually already loaded (fetched at login), so this typically fires on
  // the very first render; the ref just guards against re-running it later
  // if the store data changes while the user has already navigated around.
  const didAutoExpand = useRef(false)
  useEffect(() => {
    if (didAutoExpand.current || status !== 'loaded') return
    didAutoExpand.current = true
    if (subjects.length === 1) {
      const subject = subjects[0]
      const topic = subject.topics[0]
      setExpandedSubjectId(subject.subject_id)
      if (topic) {
        setSelectedTopicId(topic.topic_id)
        setSelectedGradeId(topic.grades[0]?.grade_id ?? null)
      }
    }
  }, [status, subjects])

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
    setSelectedGradeId(topic.grades[0]?.grade_id ?? null)
  }

  const currentSubject = subjects.find(s => s.subject_id === expandedSubjectId)
  const currentTopic = currentSubject?.topics.find(t => t.topic_id === selectedTopicId)
  const currentGrade = currentTopic?.grades.find(g => g.grade_id === selectedGradeId)

  return (
    <div className="teach-log-list">
      <div className="teach-log-list-header">
        <h2 className="teach-log-list-title">Subjects</h2>
        <button className="teach-log-list-new-btn" onClick={onLogNew}>
          New Subject
        </button>
      </div>

      {status === 'error' && <p className="teach-log-list-empty">{error}</p>}

      {status === 'loaded' && subjects.length === 0 && (
        <p className="teach-log-list-empty">Nothing logged yet — log the first topic you taught today.</p>
      )}

      {status === 'loaded' && subjects.length > 0 && (
        <div className="teach-log-columns">
          <div className="teach-log-subjects">
            {subjects.map(subject => {
              const isOpen = subject.subject_id === expandedSubjectId
              return (
                <div key={subject.subject_id} className="teach-log-subject-block">
                  <button
                    className="teach-log-subject-row"
                    onClick={() => toggleSubject(subject.subject_id)}
                  >
                    <IconBook />
                    <span className="teach-log-subject-name">{subject.subject_name}</span>
                    <span className="teach-log-subject-count">{subject.topics.length}</span>
                    <IconChevron open={isOpen} />
                  </button>

                  {isOpen && subject.topics.map(topic => (
                    <button
                      key={topic.topic_id}
                      className={`teach-log-topic-row ${topic.topic_id === selectedTopicId ? 'teach-log-topic-row--active' : ''}`}
                      onClick={() => selectTopic(subject.subject_id, topic)}
                    >
                      <span className="teach-log-topic-name">{topic.topic_name}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>

          <div className="teach-log-detail">
            {!currentTopic && (
              <p className="teach-log-list-empty">Select a topic on the left to see its questions.</p>
            )}

            {currentTopic && (
              <>
                <div className="teach-log-filter-row">
                  {currentTopic.grades.map(g => (
                    <button
                      key={g.grade_id}
                      className={`teach-log-grade-pill ${g.grade_id === selectedGradeId ? 'teach-log-grade-pill--active' : ''}`}
                      onClick={() => setSelectedGradeId(g.grade_id)}
                    >
                      {g.grade_name}
                    </button>
                  ))}
                </div>

                <div className="teach-log-qa-scroll" ref={qaScrollRef}>
                  {currentGrade?.qa_items.length === 0 && (
                    <p className="teach-log-list-empty">No questions generated for this grade yet.</p>
                  )}

                  {currentGrade?.qa_items.map(qa => (
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
