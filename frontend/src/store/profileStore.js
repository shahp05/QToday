import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const EMPTY_PROFILE = {
  token: null,
  user_id: null,
  customer_id: null,
  org_id: null,
  user_name: null,
  email_id: null,
  is_student: false,
  is_parent: false,
  is_customer_admin: false,
  is_admin: false,
  is_super_admin: false,
  customer_name: null,
  customer_acronym: null,
  board_code: null,
  board_name: null,
  country_code: null,
  country_name: null,
  admin_count: null,
  student_count: null,
  is_default_password: false,
}

export const useProfileStore = create(
  persist(
    (set) => ({
      ...EMPTY_PROFILE,

      setProfile: (profile, token) => set({ ...profile, token }),
      clearProfile: () => set({ ...EMPTY_PROFILE }),
    }),
    { name: 'qtoday-profile' }
  )
)
