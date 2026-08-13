import { create } from 'zustand'

// Normalized separately from useStudentsStore — a student's grade is its
// own timeline (history rows, is_active per row), and once quizzes join in,
// most filtering pivots on grade/topic first rather than "which student",
// so keeping grades flat and independent avoids unpacking nested arrays
// for every grade- or quiz-first query.
//
// Cached per session (see sessionsStore's CURRENT_SESSION_KEY/
// getActiveSessionKey) — populated only by studentsStore.fetchStudents(),
// the single place that ever calls GET /students/mine, never fetched
// independently here.
export const useStudentGradesStore = create((set) => ({
  bySession: {}, // key -> studentGrades[]

  setGrades: (key, studentGrades) =>
    set(state => ({ bySession: { ...state.bySession, [key]: studentGrades } })),

  clearGrades: () => set({ bySession: {} }),
}))
