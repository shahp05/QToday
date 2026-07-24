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

// answers: [{qa_id, student_response, time_taken_seconds}]
export async function submitQuiz(topicId, gradeId, answers, totalTimeTakenSeconds) {
  const res = await apiFetch('/quizzes/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic_id: topicId,
      grade_id: gradeId,
      answers,
      total_time_taken_seconds: totalTimeTakenSeconds,
    }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { quiz_id, total_marks, total_score, is_scored, pending_count }
}

export async function fetchQuizStatus(quizId) {
  const res = await apiFetch(`/quizzes/${quizId}/status`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { quiz_id, topic_id, total_marks, total_score, is_scored, pending_count }
}

export async function fetchQuizHistory(studentId) {
  const query = studentId != null ? `?student_id=${studentId}` : ''
  const res = await apiFetch(`/quizzes/history${query}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { quizzes: [{quiz_id, subject_id, subject_name, topic_id, topic_name, grade_name, date_created, total_marks, total_score, is_scored}] }
}

export async function fetchQuizDetail(quizId) {
  const res = await apiFetch(`/quizzes/${quizId}/detail`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { quiz_id, subject_id, topic_id, grade_name, date_created, total_marks, total_score, questions: [{..., challenged}] }
}

export async function challengeQuizQuestion(quizId, qaId, reason) {
  const res = await apiFetch(`/quizzes/${quizId}/questions/${qaId}/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { challenge_id, date_created }
}
