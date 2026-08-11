import { create } from 'zustand'
import { fetchMyStudents, uploadStudents } from '../services/studentsService'
import { useStudentGradesStore } from './studentGradesStore'
import { useStudentParentsStore } from './studentParentsStore'

export const useStudentsStore = create((set, get) => ({
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

  // sessionId is omitted for the ordinary case (uploads the current
  // roster); passed explicitly only when the dual-session upload selector
  // is shown (a future session is pending) and the admin picked it.
  uploadAndRefresh: async (rows, sessionId) => {
    const counts = await uploadStudents(rows, sessionId) // throws on failure — caller handles the error
    await useStudentsStore.getState().fetchStudents()
    return counts
  },

  // Applies a single row's new photo_url directly instead of refetching the
  // whole roster — same pattern as teachersStore's setSuperAdmin.
  updateStudentPhoto: (studentId, photoUrl) => {
    set({
      students: get().students.map(s =>
        s.student_id === studentId ? { ...s, photo_url: photoUrl } : s
      ),
    })
  },

  clearStudents: () => {
    set({ students: [], status: 'idle', error: null })
    useStudentGradesStore.getState().clearGrades()
    useStudentParentsStore.getState().clearParents()
  },
}))
