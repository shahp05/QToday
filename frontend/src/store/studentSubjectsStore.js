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
export const useStudentSubjectsStore = create((set, get) => ({
  byStudent: {}, // student_id -> { subjects, mostRecent, status: 'loading'|'loaded'|'error', error }

  // No-op if already loaded or a fetch is already in flight for this
  // student, same as studentDetailProgressStore.ensureLoaded.
  ensureLoaded: async (studentId) => {
    const existing = get().byStudent[studentId]
    if (existing?.status === 'loaded' || existing?.status === 'loading') return
    set(state => ({
      byStudent: { ...state.byStudent, [studentId]: { subjects: [], mostRecent: null, status: 'loading', error: null } },
    }))
    try {
      const data = await fetchSubjectsTaught(null, studentId)
      set(state => ({
        byStudent: {
          ...state.byStudent,
          [studentId]: { subjects: data.subjects, mostRecent: data.most_recent, status: 'loaded', error: null },
        },
      }))
    } catch (err) {
      set(state => ({
        byStudent: { ...state.byStudent, [studentId]: { subjects: [], mostRecent: null, status: 'error', error: err.message } },
      }))
    }
  },

  dismissError: (studentId) => set(state => {
    const entry = state.byStudent[studentId]
    if (!entry) return state
    return { byStudent: { ...state.byStudent, [studentId]: { ...entry, error: null } } }
  }),
}))
