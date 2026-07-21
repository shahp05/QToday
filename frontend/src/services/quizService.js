import { apiFetch, apiErrorMessage } from '../lib/api'

// studentId is optional — a student caller omits it (defaults to themselves
// server-side); a teacher/admin caller will pass one once that feature
// exists. See backend/services/quiz_service.py:resolve_authorized_student_id.
export async function fetchQuizProgress(studentId) {
  const query = studentId != null ? `?student_id=${studentId}` : ''
  const res = await apiFetch(`/quizzes/progress${query}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { topics: [{topic_id, subject_id, student_avg_pct, max_score_pct, last_played, attempts}] }
}

export async function startQuiz(topicId, gradeId) {
  const res = await apiFetch(`/quizzes/start?topic_id=${topicId}&grade_id=${gradeId}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { questions: [{qa_id, question_type, question, options, difficulty_level}], total_marks }
}
