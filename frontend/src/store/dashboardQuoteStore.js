import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Tracks whether the quote screen's auto-advance-to-default-page timer has
// already fired once this login. It should only ever auto-advance the
// first time a user sees the quote after logging in — if they later
// navigate back to the quote screen (including via a page refresh, which
// is why this is sessionStorage-backed instead of plain in-memory state),
// it should just sit there waiting for them to pick a page themselves, not
// restart a countdown that yanks them straight back to where they came
// from. Explicitly reset on login/logout (see LoginPage/LeftNav) — a
// refresh must NOT reset it, that's the whole point of persisting it.
export const useDashboardQuoteStore = create(
  persist(
    (set) => ({
      hasAutoAdvanced: false,
      markAutoAdvanced: () => set({ hasAutoAdvanced: true }),
      reset: () => set({ hasAutoAdvanced: false }),
    }),
    { name: 'qtoday-dashboard-quote', storage: createJSONStorage(() => sessionStorage) }
  )
)
