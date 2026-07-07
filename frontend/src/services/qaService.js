import { apiFetch, apiErrorMessage } from '../lib/api'

// All HTTP/transport logic for QA fetch/generate + teach-log history lives
// here, not in the pages — stores/pages hold state, this module is the only
// thing that knows the API shape.

export async function fetchOrGenerateQA({ subjectName, topicName, grade, section }) {
  const res = await apiFetch('/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject_name: subjectName, topic_name: topicName, grade, section }),
  })
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { items, warning }
}

export async function fetchSubjectsTaught() {
  const res = await apiFetch('/teach-logs/subjects-taught')
  if (!res.ok) throw new Error(await apiErrorMessage(res))
  return res.json() // { subjects }
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
