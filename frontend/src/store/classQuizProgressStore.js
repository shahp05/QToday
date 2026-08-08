import { create } from 'zustand'
import { fetchClassQuizProgress } from '../services/quizService'

// Per-topic stats for many students at once — backs the teacher Students
// list's per-subject status chips. Keyed student_id -> topic_id -> stats
// (mirrors useQuizProgressStore's per-topic shape, just one level deeper)
// since each row on that page needs its own student's full breakdown.
export const useClassQuizProgressStore = create((set, get) => ({
  progressByStudent: {},
  status: 'idle', // idle | loading | loaded | error
  error: null,
  loadedKey: null, // the sorted student-id set progressByStudent currently reflects

  // Skips the round-trip if this exact set of students is already
  // loaded/in flight — StudentsList calls this on every mount (e.g.
  // leaving Students and clicking back into it), and the visible
  // grade/section's roster is usually unchanged since the last visit.
  fetchClassProgress: async (studentIds) => {
    const key = [...studentIds].sort((a, b) => a - b).join(',')
    if (studentIds.length === 0) {
      set({ progressByStudent: {}, status: 'loaded', error: null, loadedKey: key })
      return
    }
    if (get().loadedKey === key && (get().status === 'loaded' || get().status === 'loading')) return
    set({ status: 'loading', error: null })
    try {
      const data = await fetchClassQuizProgress(studentIds)
      const progressByStudent = {}
      for (const row of data.progress) {
        const byTopic = progressByStudent[row.student_id] ?? (progressByStudent[row.student_id] = {})
        byTopic[row.topic_id] = row
      }
      set({ progressByStudent, status: 'loaded', loadedKey: key })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  clearClassProgress: () => set({ progressByStudent: {}, status: 'idle', error: null, loadedKey: null }),
}))
