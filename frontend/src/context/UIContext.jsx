import { createContext, useContext, useState } from 'react'
import { ROLES } from './roles'

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [activeRole, setActiveRole]     = useState(ROLES.SUPER_ADMIN)
  const [activePage, setActivePage]     = useState(null)
  const [activeSubject, setActiveSubject] = useState(null)

  return (
    <UIContext.Provider value={{
      activeRole, setActiveRole,
      activePage, setActivePage,
      activeSubject, setActiveSubject,
    }}>
      {children}
    </UIContext.Provider>
  )
}

// Paired with UIProvider above by design (the standard React context+hook
// pattern) — always used together, so splitting this into its own file
// just to satisfy Fast Refresh would add indirection for no real benefit.
// eslint-disable-next-line react-refresh/only-export-components
export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
