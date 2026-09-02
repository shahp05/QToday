import { useProfileStore } from '../store/profileStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { resetUserScopedStores } from '../store/resetUserScopedStores'
import { fetchMyStudents } from '../services/studentsService'

/** Shared by LoginPage (a real login) and ResetPasswordModal (the
 * auto-login /auth/reset-password/verify returns after a successful reset)
 * — both end up with the same {access_token, profile} shape and need the
 * same "did this actually land us somewhere real" handling: wipe any
 * leftover session, store the new one, bail out (with the profile cleared
 * again) if a parent has no wards to show, then navigate to the dashboard.
 * Returns {ok: true} on success or {ok: false, message} to display. */
export async function completeLogin(profile, token, navigate) {
  const { setProfile, clearProfile } = useProfileStore.getState()
  // Wipes any leftover data (including a manually browsed session) from
  // whoever last used this browser — including this same account, if it
  // got back here via a token expiry rather than an explicit Logout, which
  // doesn't clear this. Must run before setProfile/navigate so Dashboard's
  // mount-time fetches start from a genuinely clean slate, not a stale
  // activeSessionId.
  resetUserScopedStores()
  setProfile(profile, token)
  // A parent with no linked wards has nothing this app can show them (every
  // parent-facing page is ward-scoped) — checked here, before ever landing
  // on /dashboard, rather than leaving it to whichever page happens to
  // notice the empty roster first.
  if (profile.is_parent) {
    const { students } = await fetchMyStudents()
    if (students.length === 0) {
      clearProfile()
      return { ok: false, message: 'No student wards found' }
    }
  }
  useDashboardQuoteStore.getState().reset()
  navigate('/dashboard')
  return { ok: true }
}
