import { create } from 'zustand'

// Grade/section filter for the Students list — lifted out of StudentsPage
// into a store (rather than component state) because opening a student's
// detail now navigates to a real sibling route (/dashboard/students/:id),
// which unmounts StudentsPage entirely instead of just swapping a child
// component — local state would reset on the way back otherwise.
export const useStudentsListFilterStore = create((set) => ({
  selectedGrade: null,
  selectedSection: null,

  setSelectedGrade: (selectedGrade) => set({ selectedGrade }),
  setSelectedSection: (selectedSection) => set({ selectedSection }),
  clear: () => set({ selectedGrade: null, selectedSection: null }),
}))
