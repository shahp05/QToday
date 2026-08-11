import { create } from 'zustand'
import { fetchMyStudents } from '../services/studentsService'

// Deliberately isolated from studentsStore/studentGradesStore/
// studentParentsStore — those are shared well beyond the Students page
// (SubjectsPage's grade autocomplete, Dashboard, student detail routing),
// so writing a pre-staged future roster into them would leak next year's
// grades into today's UI elsewhere in the app. This store exists solely
// for the Students page's "view the future session's roster" mode.
export const useFutureRosterStore = create((set, get) => ({
  students: [],
  studentGrades: [],
  parents: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,
  sessionId: null, // which future session this data belongs to

  fetchFutureRoster: async (sessionId, force = false) => {
    if (!force && get().sessionId === sessionId && (get().status === 'loaded' || get().status === 'loading')) return
    set({ status: 'loading', error: null })
    try {
      const data = await fetchMyStudents(sessionId)
      set({
        students: data.students,
        studentGrades: data.student_grades,
        parents: data.parents,
        status: 'loaded',
        sessionId,
      })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  // Mirrors studentsStore.updateStudentPhoto — applies a single row's new
  // photo_url directly instead of refetching the whole roster.
  updateStudentPhoto: (studentId, photoUrl) => {
    set({
      students: get().students.map(s =>
        s.student_id === studentId ? { ...s, photo_url: photoUrl } : s
      ),
    })
  },

  clearFutureRoster: () => set({ students: [], studentGrades: [], parents: [], status: 'idle', error: null, sessionId: null }),
}))
