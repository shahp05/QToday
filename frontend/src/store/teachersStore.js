import { create } from 'zustand'
import { fetchMyTeachers, setTeacherSuperAdmin, uploadTeachers } from '../services/teachersService'

export const useTeachersStore = create((set, get) => ({
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

  setSuperAdmin: async (orgId, isSuperAdmin) => {
    const result = await setTeacherSuperAdmin(orgId, isSuperAdmin) // throws on failure — caller handles the error
    // Apply the single changed row from the response directly instead of
    // refetching the whole roster — halves the round trips before the
    // checkbox (bound to store data) can reflect the new state.
    set({
      teachers: get().teachers.map(t =>
        t.org_id === result.org_id ? { ...t, is_super_admin: result.is_super_admin } : t
      ),
    })
  },

  clearTeachers: () => {
    set({ teachers: [], status: 'idle', error: null })
  },
}))
