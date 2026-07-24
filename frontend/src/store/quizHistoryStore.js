import { create } from 'zustand'
import { fetchQuizHistory } from '../services/quizService'

// Flat, newest-first list of every quiz this student has ever played, across
// all subjects — the source for the Progress screen. Distinct from
// useQuizProgressStore, which only holds per-topic averages.
export const useQuizHistoryStore = create((set, get) => ({
  quizzes: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchQuizHistory: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading', error: null })
    try {
      const data = await fetchQuizHistory()
      set({ quizzes: data.quizzes, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  // Called after a quiz that scored immediately (no LLM pass pending) or
  // once background scoring finishes — refetches rather than patching in
  // place since a fresh play-through means a brand-new quiz_id.
  refreshQuizHistory: async () => {
    try {
      const data = await fetchQuizHistory()
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
