import { useProfileStore } from '../store/profileStore'
import { getActiveSession, getActiveSessionKey, useSessionsStore } from '../store/sessionsStore'
import { useTeachersStore } from '../store/teachersStore'

// Whether the "Teachers" left-nav icon should be reachable right now. Per
// spec:
//
//   - Once the session being browsed actually has a teacher, always show
//     it — every role needs it, past or present, exactly as before this
//     rule existed.
//   - Once it's empty: only a super-user browsing the CURRENT or FUTURE
//     session keeps it (their only way to reach the upload screen) — a
//     plain teacher/student/parent (nothing to view or upload there) and
//     anyone, including the super-user, looking at an empty PAST session
//     lose it.
//
// An admin's own account always appears in their own teacher list
// (is_sysadm counts as a "teacher" server-side — see get_my_teachers), so
// it's excluded from the emptiness count here, same as TeachersPage.jsx's
// own upload-screen gate — otherwise "no teachers" could never be true for
// the one role this rule actually needs to gate on it.
//
// Reads whichever session is currently selected (getActiveSessionKey), not
// hard-coded to the live current one — Dashboard.jsx keeps teachersStore
// reactively fetched for that session regardless of which page is actually
// showing, the same way it already does for studentsStore/subjectsTaughtStore.
//
// Returns { ready, visible } — ready=false means the roster for this
// session hasn't loaded yet; visible defaults to true in that case so the
// icon doesn't flash hidden-then-shown while data is still loading.
export function useTeachersFeatureVisible() {
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
  const selfUserId = useProfileStore(s => s.user_id)

  const activeSession = useSessionsStore(getActiveSession)
  const isPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  const activeKey = useSessionsStore(getActiveSessionKey)
  const status = useTeachersStore(s => s.bySession[activeKey]?.status ?? 'idle')
  const count = useTeachersStore(s =>
    (s.bySession[activeKey]?.teachers ?? []).filter(t => t.user_id !== selfUserId).length
  )

  if (status !== 'loaded') return { ready: false, visible: true }
  if (count > 0) return { ready: true, visible: true }
  return { ready: true, visible: isSchoolAdmin && !isPastSession }
}
