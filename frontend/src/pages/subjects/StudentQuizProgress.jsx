import { useState } from 'react'
import { getSubjectIcon } from './subjectIconMatch'
import StudentQuizList from './StudentQuizList'
import StudentProgressChart from './StudentProgressChart'
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

// Same bar-chart icon as StudentSubjectsHome's IconProgress, for visual
// consistency between the two "progress" affordances.
function IconChart() {
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

function IconTrophy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

// Two-column layout mirroring TeachLogList.jsx: subject/topic accordion on
// the left (topic counts + per-topic quiz-played counts), selected topic's
// quiz history on the right. Replaces the old subject/topic dropdown pair.
// subjects/topicStatsById/quizzes/quizHistoryStatus/quizHistoryError are
// passed in rather than read from stores here, so the teacher-facing
// single-student view (StudentSubjectDetail) can reuse this exact layout
// with per-student data instead of the current-user-scoped stores.
// readOnly: hides per-quiz expand (see StudentQuizList's own readOnly note).
export default function StudentQuizProgress({
  subjects, topicStatsById, quizzes, quizHistoryStatus, quizHistoryError, onDismissQuizHistoryError, readOnly = false,
}) {
  const [activeView, setActiveView] = useState('quizzes') // 'chart' | 'quizzes'
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
        <div className="student-quiz-progress-toggle">
          <button
            className={`student-quiz-progress-toggle-btn ${activeView === 'quizzes' ? 'student-quiz-progress-toggle-btn--active' : ''}`}
            onClick={() => setActiveView('quizzes')}
          >
            <IconTrophy /> Quizzes Played
          </button>
          <button
            className={`student-quiz-progress-toggle-btn ${activeView === 'chart' ? 'student-quiz-progress-toggle-btn--active' : ''}`}
            onClick={() => setActiveView('chart')}
          >
            <IconChart /> Progress Chart
          </button>
        </div>

        <div className="student-quiz-progress-scroll">
          {activeView === 'chart' ? (
            selectedTopic
              ? <StudentProgressChart topic={selectedTopic} quizzes={topicQuizzes} />
              : <p className="student-quiz-progress-empty">Pick a topic to see its progress chart.</p>
          ) : quizHistoryStatus === 'loading' || quizHistoryStatus === 'idle' ? (
            <div className="student-quiz-list-loading">
              <span className="student-topic-spinner student-topic-spinner--lg" />
            </div>
          ) : selectedTopic ? (
            <StudentQuizList
              quizzes={topicQuizzes}
              status={quizHistoryStatus}
              error={quizHistoryError}
              onDismissError={onDismissQuizHistoryError}
              autoExpandKey={selectedTopicId}
              readOnly={readOnly}
            />
          ) : (
            <p className="student-quiz-progress-empty">No quizzes played yet — pick a topic once you have.</p>
          )}
        </div>
      </div>
    </div>
  )
}
