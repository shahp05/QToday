import { create } from 'zustand'
import { fetchMyStudents, uploadStudents } from '../services/studentsService'
import { useStudentGradesStore } from './studentGradesStore'
import { useStudentParentsStore } from './studentParentsStore'

export const useStudentsStore = create((set) => ({
  students: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchStudents: async () => {
    set({ status: 'loading', error: null })
    try {
      const data = await fetchMyStudents()
      set({ students: data.students, status: 'loaded' })
      useStudentGradesStore.getState().setGrades(data.student_grades)
      useStudentParentsStore.getState().setParents(data.parents)
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  uploadAndRefresh: async (rows) => {
    const counts = await uploadStudents(rows) // throws on failure — caller handles the error
    await useStudentsStore.getState().fetchStudents()
    return counts
  },

  clearStudents: () => {
    set({ students: [], status: 'idle', error: null })
    useStudentGradesStore.getState().clearGrades()
    useStudentParentsStore.getState().clearParents()
  },
}))
