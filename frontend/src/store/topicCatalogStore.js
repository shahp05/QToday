import { create } from 'zustand'
import { fetchTopicCatalog } from '../services/qaService'

// Whole-school subject/topic catalog (identity only — no QA content) used
// purely to power the subject/topic combobox suggestions on the "which
// subject did you teach" form. Separate from subjectsTaughtStore, which is
// about *this teacher's own* logged history + QA content — different
// purpose, different shape, so kept apart rather than merged in.
export const useTopicCatalogStore = create((set) => ({
  topics: [], // [{subject_id, subject_name, topic_id, topic_name, taught_by_me}]
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchTopicCatalog: async () => {
    set({ status: 'loading', error: null })
    try {
      const data = await fetchTopicCatalog()
      set({ topics: data.topics, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  // Called right after a successful generate so a brand-new subject/topic
  // is immediately reusable in the combobox later in the same session,
  // without waiting for a refetch. No-ops if it's already in the catalog
  // (e.g. re-teaching something that already existed).
  addTopic: (entry) => {
    set(state => {
      const exists = state.topics.some(t => t.subject_id === entry.subject_id && t.topic_id === entry.topic_id)
      if (exists) return state
      return { topics: [...state.topics, { ...entry, taught_by_me: true }] }
    })
  },

  clearTopicCatalog: () => set({ topics: [], status: 'idle', error: null }),
}))
