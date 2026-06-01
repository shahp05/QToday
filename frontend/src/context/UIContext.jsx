import { createContext, useContext, useState } from 'react'

export const ROLES = {
  SUPER_ADMIN:    'school_super_admin',
  TEACHER_ADMIN:  'school_teacher_admin',
  STUDENT:        'school_student',
}

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]:   'Super Admin',
  [ROLES.TEACHER_ADMIN]: 'Teacher Admin',
  [ROLES.STUDENT]:       'Student',
}

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [activeRole, setActiveRole]     = useState(ROLES.SUPER_ADMIN)
  const [activePage, setActivePage]     = useState(null)
  const [activeSubject, setActiveSubject] = useState(null)
  const [user, setUser]                 = useState(null)

  return (
    <UIContext.Provider value={{
      activeRole, setActiveRole,
      activePage, setActivePage,
      activeSubject, setActiveSubject,
      user, setUser,
    }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
