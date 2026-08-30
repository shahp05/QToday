import { create } from 'zustand'
import { fetchQuizProgress, fetchQuizHistory } from '../services/quizService'

// Per-student topic stats + quiz history for the teacher-facing
// single-student subjects view (Students list -> subject chip click) —
// fetched on demand and cached per student_id, since a teacher only ever
// inspects one student's detail at a time (unlike classQuizProgressStore,
// which batches summary-only stats for every visible row on the Students
// list). Both requests go through the teacher/admin branch of
// resolve_authorized_student_id (see backend/services/quiz_service.py).
export const useStudentDetailProgressStore = create((set, get) => ({
  byStudent: {}, // student_id -> { topicStatsById, quizzes, status: 'loading'|'loaded'|'error', error }

  // No-ops if already loaded or a fetch is already in flight for this
  // student — the Students-list click handler awaits this same call, so a
  // second click on another subject chip for the same student reuses the
  // cached result instead of refetching.
  ensureLoaded: async (studentId) => {
    const existing = get().byStudent[studentId]
    if (existing?.status === 'loaded' || existing?.status === 'loading') return
    return get().refresh(studentId)
  },

  // Unconditional refetch — unlike ensureLoaded, always hits the network.
  // Used by StudentSubjectDetail's scoring-poll effect once a pending
  // quiz's LLM pass finishes, so the "Scoring quiz..." card flips to the
  // real score without the teacher having to leave and reopen the page.
  refresh: async (studentId) => {
    set(state => ({
      byStudent: { ...state.byStudent, [studentId]: { topicStatsById: {}, quizzes: [], ...state.byStudent[studentId], status: 'loading', error: null } },
    }))
    try {
      const [progress, history] = await Promise.all([
        fetchQuizProgress(studentId),
        fetchQuizHistory(studentId),
      ])
      set(state => ({
        byStudent: {
          ...state.byStudent,
          [studentId]: {
            topicStatsById: Object.fromEntries(progress.topics.map(t => [t.topic_id, t])),
            quizzes: history.quizzes,
            status: 'loaded',
            error: null,
          },
        },
      }))
    } catch (err) {
      set(state => ({
        byStudent: { ...state.byStudent, [studentId]: { topicStatsById: {}, quizzes: [], status: 'error', error: err.message } },
      }))
    }
  },

  // Dismisses the error Toast without touching status — mirrors
  // useQuizHistoryStore's dismissQuizHistoryError.
  dismissError: (studentId) => set(state => {
    const entry = state.byStudent[studentId]
    if (!entry) return state
    return { byStudent: { ...state.byStudent, [studentId]: { ...entry, error: null } } }
  }),
}))
