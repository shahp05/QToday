import { create } from 'zustand'
import { fetchSubjectsTaught, fetchTopicGradeQA } from '../services/qaService'
import { resolveApiError } from '../lib/api'
import { ErrorCode } from '../errors/errorCodes'
import { useParentWardStore } from './parentWardStore'
import { useProfileStore } from './profileStore'

// subjects-taught only ships qa_count + eagerly-loads the most-recently-
// taught (topic, grade)'s qa_items — everything else is fetched on demand
// via ensureQaLoaded() as the user clicks around, so a long teaching
// history doesn't mean shipping every question ever generated on load.
export const useSubjectsTaughtStore = create((set, get) => ({
  subjects: [],
  mostRecent: null, // { subject_id, topic_id, grade_id } | null
  status: 'idle', // idle | loading | loaded | error
  error: null,
  loadingQaKeys: new Set(), // `${topicId}:${gradeId}` currently being fetched
  qaLoadErrors: {}, // `${topicId}:${gradeId}` -> resolved message, for the last failed fetch attempt

  // Skips the round-trip if already loaded/in flight — subjects/topics
  // taught don't change from just looking at another page, so there's no
  // reason a route remount (e.g. leaving and re-clicking Students) should
  // refetch data that's already sitting in the store. Pass force:true right
  // after a mutation that actually changes this data server-side (see
  // SubjectsPage's post-log refetch), or when switching sessionId (a
  // different session means genuinely different data, not a stale cache).
  // A parent has no customer_id of their own — every fetch here resolves
  // their currently selected ward (parentWardStore) and sends it as
  // student_id, mirroring teachersStore.fetchTeachers.
  fetchSubjectsTaught: async (force = false, sessionId = null) => {
    const isParent = useProfileStore.getState().is_parent
    const wardId = isParent ? useParentWardStore.getState().selectedStudentId : null
    if (isParent && wardId == null) return // no ward selected/loaded yet — nothing to fetch

    if (!force && (get().status === 'loaded' || get().status === 'loading')) return
    set({ status: 'loading', error: null })
    try {
      const data = await fetchSubjectsTaught(sessionId, wardId)
      set({ subjects: data.subjects, mostRecent: data.most_recent, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  // Fetch a grade's qa_items the first time it's needed and cache them in
  // the tree; a no-op if already loaded or already in flight.
  ensureQaLoaded: async (topicId, gradeId, sessionId = null) => {
    const key = `${topicId}:${gradeId}`
    const subject = get().subjects.find(s => s.topics.some(t => t.topic_id === topicId))
    const topic = subject?.topics.find(t => t.topic_id === topicId)
    const grade = topic?.grades.find(g => g.grade_id === gradeId)
    if (!grade || grade.qa_items != null || get().loadingQaKeys.has(key)) return

    set(state => ({
      loadingQaKeys: new Set(state.loadingQaKeys).add(key),
      qaLoadErrors: (() => {
        const next = { ...state.qaLoadErrors }
        delete next[key]
        return next
      })(),
    }))
    try {
      const data = await fetchTopicGradeQA(topicId, gradeId, sessionId)
      set(state => ({
        subjects: state.subjects.map(s => ({
          ...s,
          topics: s.topics.map(t => t.topic_id !== topicId ? t : {
            ...t,
            grades: t.grades.map(g => g.grade_id !== gradeId ? g : { ...g, qa_items: data.qa_items }),
          }),
        })),
      }))
    } catch (err) {
      // Leave qa_items as-is (null) — the caller falls back to whatever
      // topic/grade was displayed before this fetch was kicked off. A
      // TypeError means fetch() itself never got a response (offline, DNS,
      // backend unreachable); anything else is a resolved backend error_code
      // message already produced by qaService's apiErrorMessage().
      const message = err instanceof TypeError
        ? resolveApiError({ error_code: ErrorCode.FRONTEND_NETWORK_ERROR })
        : err.message
      set(state => ({ qaLoadErrors: { ...state.qaLoadErrors, [key]: message } }))
    } finally {
      set(state => {
        const next = new Set(state.loadingQaKeys)
        next.delete(key)
        return { loadingQaKeys: next }
      })
    }
  },

  // Seed a grade's qa_items directly from a response that already carries
  // them (e.g. right after generating) — unconditional, unlike
  // ensureQaLoaded, so it also overwrites a stale/ambiguous "most recent"
  // pick. Lets the subject-list page open on this topic without a redundant
  // GET /teach-logs/qa round-trip.
  setQaItems: (topicId, gradeId, qaItems) => {
    set(state => ({
      subjects: state.subjects.map(s => ({
        ...s,
        topics: s.topics.map(t => t.topic_id !== topicId ? t : {
          ...t,
          grades: t.grades.map(g => g.grade_id !== gradeId ? g : { ...g, qa_items: qaItems, qa_count: qaItems.length }),
        }),
      })),
    }))
  },

  // Both edit and flag mutate a single qa_id somewhere inside subjects ->
  // topics -> grades -> qa_items — walk the tree once and either replace or
  // drop that item, rather than refetching the whole list from the server.
  // qa_items may be null (not loaded yet) and is left untouched in that case.
  mutateQaItems: (qaId, mutate) => {
    set(state => ({
      subjects: state.subjects.map(subject => ({
        ...subject,
        topics: subject.topics.map(topic => ({
          ...topic,
          grades: topic.grades.map(grade => ({
            ...grade,
            qa_items: grade.qa_items == null ? grade.qa_items : mutate(grade.qa_items, qaId),
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

  // Dismisses the error Toast without touching status — mirrors
  // studentDetailProgressStore's dismissError.
  clearError: () => set({ error: null }),

  clearSubjectsTaught: () => set({ subjects: [], mostRecent: null, status: 'idle', error: null, loadingQaKeys: new Set(), qaLoadErrors: {} }),
}))
