// Repeat-prompt threshold — not yet backed by an app_settings row.
const REPEAT_ELAPSED_MONTHS = 4

// Repeat is due once a quiz has been played for this topic and either the
// most recent attempt fell into the yellow/red band (last_score_pct < 75,
// same threshold scoreColor() uses) or REPEAT_ELAPSED_MONTHS have passed since.
export function isRepeatDue(stats) {
  if (!stats.last_played) return false
  if (stats.last_score_pct < 75) return true
  const lastPlayed = new Date(`${stats.last_played}T00:00:00`)
  const monthsElapsed = (Date.now() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return monthsElapsed >= REPEAT_ELAPSED_MONTHS
}

// Same red/amber/green computation the topic-seq badge on a student's topic
// card uses (see StudentSubjectsHome's topicSeqColors), plus a neutral
// 'none' for a topic that hasn't been attempted yet (no score to color-code).
// Shared between the student-facing status strip and the teacher-facing
// per-subject status chips on the Students list, so the two never disagree.
export function topicSummaryStatus(stats) {
  if (!stats.last_played) return 'none'
  const pct = stats.student_avg_pct
  if (isRepeatDue(stats) && pct >= 40) return 'amber'
  if (pct >= 75) return 'green'
  if (pct >= 40) return 'amber'
  return 'red'
}
