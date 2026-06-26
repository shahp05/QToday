import { create } from 'zustand'
import { fetchMyTeachers, uploadTeachers } from '../services/teachersService'

export const useTeachersStore = create((set) => ({
  teachers: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchTeachers: async () => {
    set({ status: 'loading', error: null })
    try {
      const data = await fetchMyTeachers()
      set({ teachers: data.teachers, status: 'loaded' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },

  uploadAndRefresh: async (rows) => {
    const counts = await uploadTeachers(rows) // throws on failure — caller handles the error
    await useTeachersStore.getState().fetchTeachers()
    return counts
  },

  clearTeachers: () => {
    set({ teachers: [], status: 'idle', error: null })
  },
}))
