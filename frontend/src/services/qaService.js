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

export async function fetchSubjectsTaught() {
  const res = await apiFetch('/teach-logs/subjects-taught')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { subjects, most_recent }
}

export async function fetchTopicGradeQA(topicId, gradeId) {
  const res = await apiFetch(`/teach-logs/qa?topic_id=${topicId}&grade_id=${gradeId}`)
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
