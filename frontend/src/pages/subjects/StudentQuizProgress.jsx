import { useState } from 'react'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import { useQuizProgressStore } from '../../store/quizProgressStore'
import { useQuizHistoryStore } from '../../store/quizHistoryStore'
import { getSubjectIcon } from './subjectIconMatch'
import StudentQuizList from './StudentQuizList'
import './StudentQuizProgress.css'

function IconChevron({ open }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

// Two-column layout mirroring TeachLogList.jsx: subject/topic accordion on
// the left (topic counts + per-topic quiz-played counts), selected topic's
// quiz history on the right. Replaces the old subject/topic dropdown pair.
export default function StudentQuizProgress() {
  const subjects = useSubjectsTaughtStore(s => s.subjects)
  const topicStatsById = useQuizProgressStore(s => s.topicStatsById)
  const quizzes = useQuizHistoryStore(s => s.quizzes)
  const quizHistoryStatus = useQuizHistoryStore(s => s.status)
  const quizHistoryError = useQuizHistoryStore(s => s.error)
  const dismissQuizHistoryError = useQuizHistoryStore(s => s.dismissQuizHistoryError)

  const [expandedSubjectId, setExpandedSubjectId] = useState(null)
  const [selectedTopicId, setSelectedTopicId] = useState(null)

  // Auto-select the subject+topic of the most recently played quiz, once
  // both the subjects list and the (already newest-first) quiz history have
  // loaded. quizHistoryStatus only ever settles once per mount, so this
  // can't clobber a later manual selection.
  const [didAutoSelect, setDidAutoSelect] = useState(false)
  if (!didAutoSelect && quizHistoryStatus === 'loaded') {
    setDidAutoSelect(true)
    const mostRecent = quizzes[0]
    if (mostRecent) {
      setExpandedSubjectId(mostRecent.subject_id)
      setSelectedTopicId(mostRecent.topic_id)
    }
  }

  function attemptsFor(topicId) {
    return topicStatsById[topicId]?.attempts ?? 0
  }

  function toggleSubject(subjectId) {
    setExpandedSubjectId(prev => (prev === subjectId ? null : subjectId))
  }

  function selectTopic(subject, topic) {
    if (attemptsFor(topic.topic_id) === 0) return
    setExpandedSubjectId(subject.subject_id)
    setSelectedTopicId(topic.topic_id)
  }

  const selectedTopic = subjects
    .flatMap(s => s.topics)
    .find(t => t.topic_id === selectedTopicId)
  const topicQuizzes = selectedTopicId == null
    ? []
    : quizzes.filter(q => q.topic_id === selectedTopicId)

  return (
    <div className="student-quiz-progress-columns">
      <div className="student-quiz-progress-subjects">
        {subjects.map(subject => {
          const isOpen = subject.subject_id === expandedSubjectId
          const SubjectIcon = getSubjectIcon(subject.subject_name, subject.icon_key)
          return (
            <div key={subject.subject_id} className="student-quiz-progress-subject-block">
              <button
                className="student-quiz-progress-subject-row"
                onClick={() => toggleSubject(subject.subject_id)}
              >
                <SubjectIcon />
                <span className="student-quiz-progress-subject-name">{subject.subject_name}</span>
                <span className="student-quiz-progress-subject-count">{subject.topics.length}</span>
                <IconChevron open={isOpen} />
              </button>

              {isOpen && subject.topics.map(topic => {
                const attempts = attemptsFor(topic.topic_id)
                const isDisabled = attempts === 0
                return (
                  <button
                    key={topic.topic_id}
                    className={`student-quiz-progress-topic-row ${topic.topic_id === selectedTopicId ? 'student-quiz-progress-topic-row--active' : ''}`}
                    onClick={() => selectTopic(subject, topic)}
                    disabled={isDisabled}
                  >
                    <span className="student-quiz-progress-topic-name">{topic.topic_name}</span>
                    <span className="student-quiz-progress-topic-count">{attempts}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="student-quiz-progress-detail">
        <div className="student-quiz-progress-scroll">
          {quizHistoryStatus === 'loading' || quizHistoryStatus === 'idle' ? (
            <div className="student-quiz-list-loading">
              <span className="student-topic-spinner student-topic-spinner--lg" />
            </div>
          ) : selectedTopic ? (
            <StudentQuizList
              quizzes={topicQuizzes}
              status={quizHistoryStatus}
              error={quizHistoryError}
              onDismissError={dismissQuizHistoryError}
              autoExpandKey={selectedTopicId}
            />
          ) : (
            <p className="student-quiz-progress-empty">No quizzes played yet — pick a topic once you have.</p>
          )}
        </div>
      </div>
    </div>
  )
}
