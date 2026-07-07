import { create } from 'zustand'
import { fetchSubjectsTaught } from '../services/qaService'

export const useSubjectsTaughtStore = create((set, get) => ({
  subjects: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchSubjectsTaught: async () => {
    set({ status: 'loading', error: null })
    try {
      const data = await fetchSubjectsTaught()
      set({ subjects: data.subjects, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  // Both edit and flag mutate a single qa_id somewhere inside subjects ->
  // topics -> grades -> qa_items — walk the tree once and either replace or
  // drop that item, rather than refetching the whole list from the server.
  mutateQaItems: (qaId, mutate) => {
    set(state => ({
      subjects: state.subjects.map(subject => ({
        ...subject,
        topics: subject.topics.map(topic => ({
          ...topic,
          grades: topic.grades.map(grade => ({
            ...grade,
            qa_items: mutate(grade.qa_items, qaId),
          })),
        })),
      })),
    }))
  },

  handleQaUpdated: (updated) => {
    get().mutateQaItems(updated.qa_id, items =>
      items.map(item => (item.qa_id === updated.qa_id ? { ...item, ...updated } : item))
    )
  },

  handleQaFlagged: (qaId) => {
    get().mutateQaItems(qaId, items => items.filter(item => item.qa_id !== qaId))
  },

  clearSubjectsTaught: () => set({ subjects: [], status: 'idle', error: null }),
}))
