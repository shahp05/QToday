import { create } from 'zustand'
import { fetchQuizHistory } from '../services/quizService'

// Flat, newest-first list of every quiz this student has ever played, across
// all subjects — the source for the Progress screen. Distinct from
// useQuizProgressStore, which only holds per-topic averages.
export const useQuizHistoryStore = create((set, get) => ({
  quizzes: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,

  // studentId: a parent's selected ward — omitted for a student (defaults
  // to themselves server-side, see resolve_authorized_student_id).
  fetchQuizHistory: async (studentId) => {
    if (get().status === 'loading') return
    set({ status: 'loading', error: null })
    try {
      const data = await fetchQuizHistory(studentId)
      set({ quizzes: data.quizzes, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  // Called after a quiz that scored immediately (no LLM pass pending) or
  // once background scoring finishes — refetches rather than patching in
  // place since a fresh play-through means a brand-new quiz_id. studentId:
  // same as fetchQuizHistory (only ever meaningful for a parent, since a
  // student/read-only ward view never plays a quiz itself, but accepted
  // for symmetry).
  refreshQuizHistory: async (studentId) => {
    try {
      const data = await fetchQuizHistory(studentId)
      set({ quizzes: data.quizzes, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  clearQuizHistory: () => set({ quizzes: [], status: 'idle', error: null }),

  // Dismisses the error Toast without touching quizzes/status — status stays
  // 'error' so a stale/empty list isn't mistaken for "no quizzes played".
  dismissQuizHistoryError: () => set({ error: null }),
}))
