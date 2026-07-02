import { Fragment, useEffect, useState } from 'react'
import { fetchMyTeachLogs } from '../../services/qaService'
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
  const [status, setStatus] = useState('loading') // loading | loaded | error
  const [subjects, setSubjects] = useState([])
  const [error, setError] = useState('')
  const [expandedSubjectId, setExpandedSubjectId] = useState(null)
  const [selectedTopicId, setSelectedTopicId] = useState(null)
  const [selectedGradeId, setSelectedGradeId] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchMyTeachLogs()
      .then(data => {
        if (cancelled) return
        setSubjects(data.subjects)
        // Auto-expand + auto-select when there's exactly one subject with one topic —
        // nothing to browse, so jump straight to the questions.
        if (data.subjects.length === 1 && data.subjects[0].topics.length === 1) {
          const subject = data.subjects[0]
          const topic = subject.topics[0]
          setExpandedSubjectId(subject.subject_id)
          setSelectedTopicId(topic.topic_id)
          setSelectedGradeId(topic.grades[0]?.grade_id ?? null)
        }
        setStatus('loaded')
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [])

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

      {status === 'loading' && <p className="teach-log-list-empty">Loading…</p>}
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

                {currentGrade?.qa_items.length === 0 && (
                  <p className="teach-log-list-empty">No questions generated for this grade yet.</p>
                )}

                {currentGrade?.qa_items.map((qa, qi) => (
                  <Fragment key={qa.qa_id}>
                    {qi > 0 && <div className="teach-log-qa-divider" />}
                    <div className="teach-log-qa-item">
                      <div className="teach-log-qa-question-row">
                        <span className="teach-log-qa-question">{qa.question}</span>
                        <span className="teach-log-qa-level">Level {qa.difficulty_level}</span>
                      </div>
                      {qa.options && (
                        <ul className="teach-log-qa-options">
                          {Object.entries(qa.options).map(([key, text]) => (
                            <li key={key}>{key.toUpperCase()}. {text}</li>
                          ))}
                        </ul>
                      )}
                      <p className="teach-log-qa-answer">Answer: {qa.answer}</p>
                    </div>
                  </Fragment>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
