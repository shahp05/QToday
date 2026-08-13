import { create } from 'zustand'

// Flat like studentGradesStore — one student can have multiple parent
// links (and other link types later), so this stays its own slice rather
// than nesting arrays inside useStudentsStore.
//
// Cached per session, same shape/reasoning as studentGradesStore —
// populated only by studentsStore.fetchStudents().
export const useStudentParentsStore = create((set) => ({
  bySession: {}, // key -> parents[]

  setParents: (key, parents) =>
    set(state => ({ bySession: { ...state.bySession, [key]: parents } })),

  clearParents: () => set({ bySession: {} }),
}))
