import { create } from 'zustand'
import { fetchSubjectsTaught } from '../services/qaService'

// Per-student subjects/topics tree for the teacher-facing single-student
// view (Students list -> subject chip click, StudentSubjectDetail.jsx) —
// fetched on demand and cached per student_id, mirroring
// studentDetailProgressStore's pattern for that same page's quiz progress/
// history. Deliberately separate from subjectsTaughtStore (the teacher's
// OWN subjects page): reusing that single flat slot and filtering it
// client-side by grade_id used to be how this worked, but a topic taught
// at an earlier grade with a retention range covering this student's
// grade only ever appears under the LEARNER's own grade (see backend's
// _learner_subjects_taught), never under the original taught grade in the
// teacher's own tree — so client-side filtering could never surface it.
// This instead asks the backend for that specific student's own
// retention-aware view directly (list_subjects_taught's student_id
// param, now also meaningful for a staff caller — see its docstring).
// Cache key covers both dimensions this data actually varies by — a
// student's subjects/topics tree differs per academic session (retention
// range, what was taught when), so keying by student_id alone left a
// second session's view silently reusing the first session's cached (or
// worse, in-flight-as-current) result. 'current' for the live session,
// matching the null-means-current convention every session-aware fetch
// in this app already uses.
// Exported so callers can select byStudent[studentSubjectsCacheKey(...)]
// without duplicating the key format.
export function studentSubjectsCacheKey(studentId, sessionId) {
  return `${studentId}:${sessionId ?? 'current'}`
}

export const useStudentSubjectsStore = create((set, get) => ({
  byStudent: {}, // "studentId:sessionKey" -> { subjects, mostRecent, status: 'loading'|'loaded'|'error', error }

  // No-op if already loaded or a fetch is already in flight for this
  // student+session, same as studentDetailProgressStore.ensureLoaded.
  ensureLoaded: async (studentId, sessionId = null) => {
    const key = studentSubjectsCacheKey(studentId, sessionId)
    const existing = get().byStudent[key]
    if (existing?.status === 'loaded' || existing?.status === 'loading') return
    set(state => ({
      byStudent: { ...state.byStudent, [key]: { subjects: [], mostRecent: null, status: 'loading', error: null } },
    }))
    try {
      const data = await fetchSubjectsTaught(sessionId, studentId)
      set(state => ({
        byStudent: {
          ...state.byStudent,
          [key]: { subjects: data.subjects, mostRecent: data.most_recent, status: 'loaded', error: null },
        },
      }))
    } catch (err) {
      set(state => ({
        byStudent: { ...state.byStudent, [key]: { subjects: [], mostRecent: null, status: 'error', error: err.message } },
      }))
    }
  },

  dismissError: (studentId, sessionId = null) => set(state => {
    const key = studentSubjectsCacheKey(studentId, sessionId)
    const entry = state.byStudent[key]
    if (!entry) return state
    return { byStudent: { ...state.byStudent, [key]: { ...entry, error: null } } }
  }),
}))
