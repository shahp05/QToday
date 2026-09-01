import { create } from 'zustand'
import { fetchMyCustomer } from '../services/customersService'
import { fetchStates } from '../services/geoService'
import { resolveApiError } from '../lib/api'
import { ErrorCode } from '../errors/errorCodes'

// Backs the Account nav item's click-to-fetch-then-navigate flow (see
// LeftNav.jsx) and AccountDataSection's render — same "idle | loading |
// loaded | error" shape as subjectsTaughtStore, fetched once and reused
// rather than re-fetched every time the page mounts.
export const useAccountStore = create((set, get) => ({
  customer: null,
  states: [],
  status: 'idle', // idle | loading | loaded | error
  error: null,

  fetchAccountData: async (force = false) => {
    if (!force && (get().status === 'loaded' || get().status === 'loading')) return
    set({ status: 'loading', error: null })
    try {
      const customer = await fetchMyCustomer()
      const states = await fetchStates(customer.country_id)
      set({ customer, states, status: 'loaded' })
    } catch (err) {
      // A TypeError means fetch() itself never got a response (offline,
      // DNS, backend unreachable); anything else is a resolved backend
      // error_code message already produced by apiErrorMessage() —
      // same distinction subjectsTaughtStore.ensureQaLoaded makes.
      const message = err instanceof TypeError
        ? resolveApiError({ error_code: ErrorCode.FRONTEND_NETWORK_ERROR })
        : err.message
      set({ status: 'error', error: message })
    }
  },

  // After a successful save — refreshes the cached customer without a
  // round-trip, same idea as subjectsTaughtStore.setQaItems.
  setCustomer: (customer) => set({ customer }),

  clearAccountData: () => set({ customer: null, states: [], status: 'idle', error: null }),
}))
