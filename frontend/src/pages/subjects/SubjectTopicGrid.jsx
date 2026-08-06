import { scoreColor } from '../../lib/scoreColor'
import { topicSummaryStatus, topicSeqColors, isRepeatDue } from '../../lib/topicStatus'
import { getSubjectIcon } from './subjectIconMatch'
import Dropdown from '../../components/Dropdown'

const NOT_ATTEMPTED = { student_avg_pct: 0, max_score_pct: 0, last_score_pct: null, last_played: null, attempts: 0 }

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Subject dropdown + per-topic status strip + topic-card grid — the same
// "topics" view StudentSubjectsHome shows a student, extracted so the
// teacher-facing single-student view (StudentSubjectDetail) can render the
// identical cards read-only instead of re-implementing them.
export default function SubjectTopicGrid({
  subjects, // [{subject_id, subject_name, icon_key, topics}]
  activeSubjectId,
  onSelectSubject,
  topicStatsById, // topic_id -> {student_avg_pct, max_score_pct, last_score_pct, last_played, attempts}
  readOnly = false, // teacher view: no quiz-start is possible for another student, so hide Play entirely
  onCardClick,
  onPlayClick,
  loadingQuiz, // {topicId, source: 'play' | 'card'} | null
  scoringTopics, // topic_id -> quiz_id
}) {
  const activeSubject = subjects.find(s => s.subject_id === activeSubjectId)
  if (!activeSubject) return null

  const subjectOptions = subjects.map(s => {
    const Icon = getSubjectIcon(s.subject_name, s.icon_key)
    return { key: s.subject_id, label: s.subject_name, icon: <Icon /> }
  })

  return (
    <>
      <div className="student-subjects-bar">
        <Dropdown
          className="student-subjects-dropdown"
          value={activeSubjectId}
          options={subjectOptions}
          onChange={onSelectSubject}
        />
        <div className="student-topic-status-strip" role="img" aria-label="Topic status overview">
          {activeSubject.topics.map(topic => {
            const stats = topicStatsById[topic.topic_id] ?? NOT_ATTEMPTED
            return (
              <span
                key={topic.topic_id}
                className={`student-topic-status-dot student-topic-status-dot--${topicSummaryStatus(stats)}`}
                title={topic.topic_name}
              />
            )
          })}
        </div>
      </div>

      <div className="student-subjects-body">
        <div className="student-topic-grid">
          {activeSubject.topics.map((topic, index) => {
            const stats = topicStatsById[topic.topic_id] ?? NOT_ATTEMPTED
            const isLoadingThis = !readOnly && loadingQuiz?.topicId === topic.topic_id
            const isScoringThis = !readOnly && !!scoringTopics?.[topic.topic_id]
            return (
              <div
                key={topic.topic_id}
                className="student-topic-card"
                role={readOnly ? undefined : 'button'}
                tabIndex={readOnly ? undefined : 0}
                onClick={readOnly ? undefined : () => onCardClick?.(topic)}
                onKeyDown={readOnly ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick?.(topic) } }}
                style={readOnly ? { cursor: 'default' } : undefined}
              >
                <div className="student-topic-card-header">
                  <span className="student-topic-seq" style={topicSeqColors(stats)}>{index + 1}</span>
                  <h3 className="student-topic-card-name">{topic.topic_name}</h3>
                </div>

                <div className="student-topic-progress">
                  {stats.last_played ? (
                    <div className="student-topic-progress-row">
                      <span className="student-topic-progress-label">{formatDate(stats.last_played)}</span>
                      <div className="student-topic-progress-track">
                        <div className="student-topic-progress-fill" style={{ width: `${stats.last_score_pct}%`, background: scoreColor(stats.last_score_pct) }} />
                      </div>
                      <span className="student-topic-progress-value">{stats.last_score_pct}%</span>
                    </div>
                  ) : (
                    <p className="student-topic-not-attempted">Not attempted yet</p>
                  )}
                  <div className="student-topic-progress-row">
                    <span className="student-topic-progress-label">Your average</span>
                    <div className="student-topic-progress-track">
                      <div className="student-topic-progress-fill" style={{ width: `${stats.student_avg_pct}%`, background: scoreColor(stats.student_avg_pct) }} />
                    </div>
                    <span className="student-topic-progress-value">{stats.student_avg_pct}%</span>
                  </div>
                  <div className="student-topic-progress-row">
                    <span className="student-topic-progress-label">Top score</span>
                    <div className="student-topic-progress-track">
                      <div className="student-topic-progress-fill" style={{ width: `${stats.max_score_pct}%`, background: scoreColor(stats.max_score_pct) }} />
                    </div>
                    <span className="student-topic-progress-value">{stats.max_score_pct}%</span>
                  </div>
                </div>

                {!readOnly && (
                  <div className="student-topic-actions">
                    <button
                      className={`student-topic-play-btn${isRepeatDue(stats) ? ' student-topic-play-btn--repeat' : ''}`}
                      onClick={e => { e.stopPropagation(); onPlayClick?.(topic) }}
                      aria-label={`Play ${topic.topic_name} quiz`}
                      disabled={!!loadingQuiz || isScoringThis}
                    >
                      {isLoadingThis && loadingQuiz.source === 'play' ? (
                        <span className="student-topic-spinner" />
                      ) : (
                        <>
                          {isRepeatDue(stats) && <span className="student-topic-play-btn-label">Repeat</span>}
                          <IconPlay />
                        </>
                      )}
                    </button>
                  </div>
                )}

                {isLoadingThis && loadingQuiz.source === 'card' && (
                  <div className="student-topic-card-overlay">
                    <span className="student-topic-spinner student-topic-spinner--lg" />
                  </div>
                )}

                {isScoringThis && (
                  <div className="student-topic-card-overlay">
                    <span className="student-topic-scoring-label">
                      <span className="student-topic-spinner" /> Scoring…
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
