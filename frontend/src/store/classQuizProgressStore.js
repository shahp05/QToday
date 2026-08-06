import { create } from 'zustand'
import { fetchClassQuizProgress } from '../services/quizService'

// Per-topic stats for many students at once — backs the teacher Students
// list's per-subject status chips. Keyed student_id -> topic_id -> stats
// (mirrors useQuizProgressStore's per-topic shape, just one level deeper)
// since each row on that page needs its own student's full breakdown.
export const useClassQuizProgressStore = create((set) => ({
  progressByStudent: {},
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchClassProgress: async (studentIds) => {
    if (studentIds.length === 0) {
      set({ progressByStudent: {}, status: 'loaded', error: null })
      return
    }
    set({ status: 'loading', error: null })
    try {
      const data = await fetchClassQuizProgress(studentIds)
      const progressByStudent = {}
      for (const row of data.progress) {
        const byTopic = progressByStudent[row.student_id] ?? (progressByStudent[row.student_id] = {})
        byTopic[row.topic_id] = row
      }
      set({ progressByStudent, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },
}))
