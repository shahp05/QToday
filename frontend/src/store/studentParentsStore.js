import { create } from 'zustand'

// Flat like studentGradesStore — one student can have multiple parent
// links (and other link types later), so this stays its own slice rather
// than nesting arrays inside useStudentsStore.
export const useStudentParentsStore = create((set, get) => ({
  parents: [],

  setParents: (parents) => set({ parents }),
  clearParents: () => set({ parents: [] }),

  getParentEmails: (studentId) =>
    get().parents
      .filter(p => p.student_id === studentId)
      .map(p => p.email_id),
}))
