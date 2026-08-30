import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const EMPTY_PROFILE = {
  token: null,
  user_id: null,
  customer_id: null,
  org_id: null,
  user_name: null,
  email_id: null,
  photo_url: null,
  is_student: false,
  is_parent: false,
  is_school_admin: false,
  is_school_teacher: false,
  is_system_admin: false,
  customer_name: null,
  customer_acronym: null,
  board_code: null,
  board_name: null,
  country_code: null,
  country_name: null,
  admin_count: null,
  student_count: null,
  is_default_password: false,
  password_date_created: null,
}

export const useProfileStore = create(
  persist(
    (set) => ({
      ...EMPTY_PROFILE,

      setProfile: (profile, token) => set({ ...profile, token }),
      clearProfile: () => set({ ...EMPTY_PROFILE }),
      // Photo isn't session data (same reasoning as studentsStore/
      // teachersStore's own photo updaters) — just the signed-in user's own
      // single current value, patched locally right after a successful
      // upload rather than refetching the whole profile.
      updateOwnPhoto: (photoUrl) => set({ photo_url: photoUrl }),
      // Same local-patch-after-mutation pattern as updateOwnPhoto — the
      // change-password endpoint returns the full profile, but only these
      // two fields actually changed as a result of it.
      applyPasswordChange: (profile) => set({
        is_default_password: profile.is_default_password,
        password_date_created: profile.password_date_created,
      }),
    }),
    { name: 'qtoday-profile' }
  )
)
