import { create } from 'zustand'

// Which of a parent's wards (children) is currently selected — every
// session-aware fetch a parent makes (sessions, teachers, and eventually
// their own subjects/quiz history) needs this, since a parent has no
// customer_id of their own to resolve "which school" from. Only ever
// meaningful for is_parent; every other role ignores this store entirely.
// No UI to pick a ward beyond a plain selector exists yet (see LeftNav) —
// this is deliberately minimal, not the full parent-portal redesign.
export const useParentWardStore = create((set) => ({
  selectedStudentId: null,
  setSelectedStudentId: (studentId) => set({ selectedStudentId: studentId }),
  clear: () => set({ selectedStudentId: null }),
}))
