import { useProfileStore } from '../store/profileStore'
import { getActiveSession, getActiveSessionKey, useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useStudentGradesStore } from '../store/studentGradesStore'

// Whether the "Students" left-nav icon should be reachable right now, for
// a school admin or teacher — a parent's use of this same button is an
// unrelated ward-switcher (see LeftNav.jsx's isWardButton) and is never
// gated by this hook; it stays unconditionally visible for them. Per spec:
//
//   - Once the session being browsed actually has a roster, always show
//     it — teacher and admin both need it, past or present, exactly as
//     before this rule existed.
//   - Once it's empty: only a super-user browsing the CURRENT or FUTURE
//     session keeps it (their only way to reach the upload screen) — a
//     plain teacher (nothing to view or upload there) and anyone,
//     including the super-user, looking at an empty PAST session lose it.
//
// Reads whichever session is currently selected (getActiveSessionKey), not
// hard-coded to the live current one — Dashboard.jsx keeps studentsStore
// reactively fetched for that session regardless of which page is actually
// showing, the same way it already does for subjectsTaughtStore.
//
// Returns { ready, visible } — ready=false means the roster for this
// session hasn't loaded yet; visible defaults to true in that case so the
// icon doesn't flash hidden-then-shown while data is still loading.
export function useStudentsFeatureVisible() {
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)

  const activeSession = useSessionsStore(getActiveSession)
  const isPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  const activeKey = useSessionsStore(getActiveSessionKey)
  const status = useStudentsStore(s => s.bySession[activeKey]?.status ?? 'idle')
  const count = useStudentGradesStore(s => (s.bySession[activeKey] ?? []).length)

  if (status !== 'loaded') return { ready: false, visible: true }
  if (count > 0) return { ready: true, visible: true }
  return { ready: true, visible: isSchoolAdmin && !isPastSession }
}
