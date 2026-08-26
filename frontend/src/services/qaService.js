import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for QA fetch/generate + teach-log history lives
// here, not in the pages — stores/pages hold state, this module is the only
// thing that knows the API shape.

export async function fetchOrGenerateQA({ subjectName, topicName, grade, section, logDate }) {
  const res = await apiFetch('/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject_name: subjectName,
      topic_name: topicName,
      grade,
      section,
      // Built from local y/m/d, not toISOString(), so a backdated log near
      // midnight can't shift a day off in UTC-converting timezones.
      log_date: logDate
        ? `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`
        : null,
    }),
    // This round-trip runs an LLM generation on the backend — well past the
    // default timeout for a plain DB-backed request.
    timeoutMs: 90000,
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { items, warning_code, subject_id, topic_id, grade_id }
}

// studentId is a parent's selected ward — a parent has no customer_id of
// their own (their wards can be at different schools), so the backend
// resolves "which school" from it instead; every other role omits it.
export async function fetchSubjectsTaught(sessionId, studentId) {
  const params = new URLSearchParams()
  if (sessionId != null) params.set('session_id', sessionId)
  if (studentId != null) params.set('student_id', studentId)
  const qs = params.toString()
  const res = await apiFetch(`/teach-logs/subjects-taught${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { subjects, most_recent }
}

// Teacher/admin review-and-edit screen only (TeachLogList) — a student's
// or parent's only path to a question's answer is a quiz they've actually
// played (fetchQuizDetail), never this full topic/grade bank; the backend
// rejects is_student/is_parent callers outright.
export async function fetchTopicGradeQA(topicId, gradeId, sessionId) {
  const qs = sessionId != null ? `&session_id=${sessionId}` : ''
  const res = await apiFetch(`/teach-logs/qa?topic_id=${topicId}&grade_id=${gradeId}${qs}`)
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { qa_items }
}

export async function fetchTopicCatalog() {
  const res = await apiFetch('/teach-logs/topic-catalog')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { topics: [{subject_id, subject_name, topic_id, topic_name, taught_by_me}] }
}

export async function updateQA(qaId, payload) {
  const res = await apiFetch(`/qa/${qaId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // updated QAItem, or { qa_id, is_active, flag_reason } for a flag
}
