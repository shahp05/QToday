import { create } from 'zustand'

// Normalized separately from useStudentsStore — a student's grade is its
// own timeline (history rows, is_active per row), and once quizzes join in,
// most filtering pivots on grade/topic first rather than "which student",
// so keeping grades flat and independent avoids unpacking nested arrays
// for every grade- or quiz-first query.
export const useStudentGradesStore = create((set, get) => ({
  studentGrades: [],

  setGrades: (studentGrades) => set({ studentGrades }),
  clearGrades: () => set({ studentGrades: [] }),

  getGradeForStudent: (studentId) =>
    get().studentGrades.find(g => g.student_id === studentId && g.is_active) ?? null,

  getStudentIdsInGrade: (gradeName, section) =>
    get().studentGrades
      .filter(g => g.is_active && g.grade_name === gradeName && (section === undefined || g.section === section))
      .map(g => g.student_id),
}))
