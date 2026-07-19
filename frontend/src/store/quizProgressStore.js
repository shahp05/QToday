import { create } from 'zustand'
import { fetchQuizProgress } from '../services/quizService'

// Keyed by topic_id for O(1) lookup from the topic-card grid — the raw API
// array gets flattened into a map once here rather than in the component.
export const useQuizProgressStore = create((set) => ({
  topicStatsById: {}, // topic_id -> {student_avg_pct, max_score_pct, last_played, attempts}
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchQuizProgress: async () => {
    set({ status: 'loading', error: null })
    try {
      const data = await fetchQuizProgress()
      set({
        topicStatsById: Object.fromEntries(data.topics.map(t => [t.topic_id, t])),
        status: 'loaded',
      })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  clearQuizProgress: () => set({ topicStatsById: {}, status: 'idle', error: null }),
}))
