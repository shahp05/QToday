import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { CURRENT_SESSION_KEY, useSessionsStore } from '../store/sessionsStore'
import { useParentWardStore } from '../store/parentWardStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useAccountStore } from '../store/accountStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { resetUserScopedStores } from '../store/resetUserScopedStores'
import { useSubjectsFeatureVisible } from '../hooks/useSubjectsFeatureVisible'
import { useStudentsFeatureVisible } from '../hooks/useStudentsFeatureVisible'
import Dropdown from './Dropdown'
import ScheduleSessionDialog from './ScheduleSessionDialog'
import logo from '../assets/logo_48.webp'
import './LeftNav.css'

function IconSubjects() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
    </svg>
  )
}

function IconStudents() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
    </svg>
  )
}

function IconTeachers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55z"/>
      <path d="M12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>
    </svg>
  )
}

function IconAccount() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2zm12 4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm-9 8c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1H6v-1z"/>
    </svg>
  )
}

function IconSpinner() {
  return <span className="leftnav-item-spinner" role="status" aria-label="Loading" />
}

function IconLogout() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
    </svg>
  )
}

// A stable reference for "no wards cached yet" — returning a fresh [] from
// a zustand selector instead would make React think the store keeps
// changing on every read, causing an infinite re-render loop.
const EMPTY_ARRAY = []

const NAV_ITEMS = [
  // A parent reaches the same Subjects page as everyone else (read-only,
  // scoped to whichever ward is selected — see SubjectsRoute.jsx) via this
  // same icon now, same as any other role.
  { id: 'subjects',  label: 'Subjects',  Icon: IconSubjects },
  // Only the customer's sys admin (uploads/manages the roster) and its
  // teachers (view it) have any use for the roster page itself — a student
  // only has their own row. A parent gets this same slot repurposed as a
  // ward dropdown (see the render loop below) rather than the roster page,
  // so it's visible to them too.
  { id: 'students',  label: 'Students',  Icon: IconStudents, visible: p => p.is_school_admin || p.is_school_teacher || p.is_parent },
  { id: 'teachers',  label: 'Teachers',  Icon: IconTeachers },
  { id: 'account',   label: 'Account',   Icon: IconAccount  },
]

export default function LeftNav() {
  const profile = useProfileStore()
  const clearProfile = useProfileStore(s => s.clearProfile)
  // Only this one is still needed standalone here — the ward-switch effect
  // below clears sessions on its own (a ward change, not a logout).
  // Everything else logout needs to wipe is covered by
  // resetUserScopedStores(), the same helper LoginPage.jsx uses so a
  // fresh login is guaranteed clean too, regardless of whether the
  // previous session ended via this Logout button or a token expiry.
  const clearSessions = useSessionsStore(s => s.clearSessions)
  const resetQuoteAutoAdvance = useDashboardQuoteStore(s => s.reset)
  const studentsStatus = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  const teachersStatus = useTeachersStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const accountStatus = useAccountStore(s => s.status)
  const fetchAccountData = useAccountStore(s => s.fetchAccountData)
  const { visible: subjectsFeatureVisible } = useSubjectsFeatureVisible()
  const { visible: studentsFeatureVisible } = useStudentsFeatureVisible()
  const navigate = useNavigate()
  const location = useLocation()

  // Single site-wide session picker — replaces the old per-page "Schedule
  // Next Session" button and Students' own current/future toggle, both of
  // which only ever affected that one page. Every session-aware page reads
  // sessionsStore.activeSessionId directly, so switching here is what makes
  // "was this upload meant for the current or the new session?" unambiguous
  // everywhere at once, not just wherever the control happened to live.
  // Visible to every role once past sessions exist — only "New session"
  // (creating one) stays sys-admin only, below.
  const sessions = useSessionsStore(s => s.sessions)
  const currentSession = sessions.find(sess => sess.is_current)
  const futureSession = sessions.find(sess => sess.is_future)
  // Already most-recent-first from the backend — reverse chronology is
  // exactly the order the dropdown wants past sessions in.
  const pastSessions = sessions.filter(sess => !sess.is_current && !sess.is_future)
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const setActiveSessionId = useSessionsStore(s => s.setActiveSessionId)
  const fetchSessions = useSessionsStore(s => s.fetchSessions)
  const [showSessionDialog, setShowSessionDialog] = useState(false)

  // Picking "New session" before one has ever been scheduled opens the
  // dialog instead of switching to nothing — there's no future session yet
  // to switch the view to.
  function handleSessionChange(sessionId) {
    if (sessionId === 'schedule-new') {
      setShowSessionDialog(true)
      return
    }
    setActiveSessionId(sessionId)
  }

  // A parent has no customer_id of their own — "which session"/"which
  // school" is meaningless until a ward (child) is selected, since each can
  // be at a different school. A single ward auto-selects silently; the
  // repurposed "Students" nav slot is the dropdown itself (see the render
  // loop below) regardless of ward count, so a lone ward still shows up
  // there, just with nothing else to pick.
  const isParent = profile.is_parent
  const wards = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.students ?? EMPTY_ARRAY)
  const selectedWardId = useParentWardStore(s => s.selectedStudentId)
  const setSelectedWardId = useParentWardStore(s => s.setSelectedStudentId)
  const selectedWard = wards.find(w => w.student_id === selectedWardId) ?? null
  const clearTeachersCache = useTeachersStore(s => s.clearTeachers)
  const fetchTeachersForWard = useTeachersStore(s => s.fetchTeachers)
  const clearSubjectsCache = useSubjectsTaughtStore(s => s.clearSubjectsTaught)
  const fetchSubjectsForWard = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)

  // Done directly during render (not an effect) — a one-time derived-state
  // adjustment, same pattern used elsewhere in this codebase (e.g.
  // TeachLogList's auto-expand-most-recent).
  if (isParent && selectedWardId == null && wards.length > 0) {
    setSelectedWardId(wards[0].student_id)
  }

  // A different ward can mean a different school entirely — nothing cached
  // under the plain session-keyed caches (teachers, subjects taught, the
  // session list itself) is valid across that boundary. Clearing and
  // refetching on every change (including the very first selection, when
  // both are empty anyway) is simpler than threading a second cache
  // dimension by ward through every store built on CURRENT_SESSION_KEY.
  useEffect(() => {
    if (!isParent || selectedWardId == null) return
    clearTeachersCache()
    clearSubjectsCache()
    clearSessions()
    fetchSessions(selectedWardId)
    // Dashboard's own eager fetchTeachers()/fetchSubjectsTaught() calls (on
    // mount, for every role) fire before a parent's ward is known and bail
    // out with nothing to fetch — this is what actually populates the
    // Teachers nav item and the Subjects page for a parent, since nothing
    // else retries them once the ward becomes known.
    fetchTeachersForWard()
    fetchSubjectsForWard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, selectedWardId])

  const isLoadingById = {
    students: studentsStatus === 'idle' || studentsStatus === 'loading',
    teachers: teachersStatus === 'idle' || teachersStatus === 'loading',
    subjects: subjectsStatus === 'idle' || subjectsStatus === 'loading',
    // Not eagerly prefetched like the others above (nothing else needs
    // account data before it's actually opened) — 'idle' is the normal
    // at-rest state here, not a loading one, so only 'loading' itself
    // (kicked off by handleNav below, on click) shows the spinner.
    account: accountStatus === 'loading',
  }

  // A parent has no school/board/country of their own — these reflect the
  // selected ward's instead once one is known.
  const infoItems = isParent
    ? [
        { label: 'School',  value: selectedWard?.customer_acronym || '—' },
        { label: 'Board',   value: selectedWard?.board_code        || '—' },
        { label: 'Country', value: selectedWard?.country_name      || '—' },
      ]
    : [
        { label: 'School',  value: profile.customer_acronym || '—' },
        { label: 'Board',   value: profile.board_code       || '—' },
        { label: 'Country', value: profile.country_name     || '—' },
      ]

  // Active state (and the isActive() guard below) match on a path prefix,
  // not exact equality, so Students stays highlighted while a student's
  // detail route (/dashboard/students/:id) is open too.
  function isActive(id) {
    return location.pathname === `/dashboard/${id}` || location.pathname.startsWith(`/dashboard/${id}/`)
  }

  // Account is the one nav item with nothing prefetched on mount (unlike
  // Students/Teachers/Subjects, fetched eagerly elsewhere as soon as the
  // dashboard loads) — its data (AccountDataSection's customer + states)
  // is only ever needed once this page is actually opened, so it's fetched
  // right here, on click, with the same spinner shown while that's in
  // flight, before navigating. fetchAccountData no-ops if already
  // loaded/in flight, so re-clicking Account is cheap. Only fetched for a
  // school admin — everyone else's Account page is just Change Password,
  // nothing to prefetch.
  async function handleNav(id) {
    const alreadyActive = isActive(id)
    // Fetch even when already on /dashboard/account — e.g. retrying after
    // a failed fetch on refresh (see accountStore's status). Skipping the
    // whole handler here used to also skip this fetch, so clicking Account
    // again while already there (the exact position a refresh leaves you
    // in) couldn't retry at all.
    if (id === 'account' && profile.is_school_admin) {
      await fetchAccountData()
    }
    if (alreadyActive) return
    navigate(`/dashboard/${id}`)
  }

  // The ward dropdown's onChange (a parent's sole "Students" nav slot,
  // replacing that button entirely) — just switches which ward is
  // selected. No navigation: every ward-scoped page (Subjects, Teachers)
  // already re-fetches for the new selectedWardId on its own (see the
  // effect above and each page's own studentId-keyed fetches), so
  // whatever the parent is currently looking at updates in place.
  function handleWardSelect(wardId) {
    setSelectedWardId(wardId)
  }

  function handleLogout() {
    // Navigate away first — clearing the profile/session stores while
    // still on a nested /dashboard/* route can otherwise cause that page's
    // own "hide when nothing to show" effect (e.g. StudentsPage) to fire
    // first and redirect to plain /dashboard instead, before this
    // navigate takes effect. Dashboard.jsx's own token guard is the real
    // backstop, but leaving first avoids the visible bounce.
    navigate('/')
    clearProfile()
    resetUserScopedStores()
    resetQuoteAutoAdvance()
  }

  return (
    <aside className="leftnav" aria-label="Main navigation">

      <div className="leftnav-logo-cell">
        <img src={logo} alt="QToday" className="leftnav-logo-img" />
      </div>

      <nav className="leftnav-items">
        {NAV_ITEMS.filter(item =>
          (!item.visible || item.visible(profile)) &&
          (item.id !== 'subjects' || subjectsFeatureVisible) &&
          // A parent's "Students" is the unrelated ward dropdown (see
          // isWardSlot below) — never gated by studentsFeatureVisible,
          // which only decides the admin/teacher roster page's visibility.
          (item.id !== 'students' || profile.is_parent || studentsFeatureVisible)
          // Teachers has no visibility gate at all — per spec, this page
          // can never be empty (at least one super-admin always exists),
          // so it's unconditionally reachable for every role.
        // NAV_ITEMS' own order (Subjects, then Students) is right for every
        // other role, but a parent needs the ward dropdown to lead — it's
        // what every other item below it (Subjects, Teachers) is scoped
        // to — so it's the one case that gets reordered to the front here.
        ).sort((a, b) => {
          if (!isParent) return 0
          if (a.id === 'students') return -1
          if (b.id === 'students') return 1
          return 0
        }).map(({ id, label, Icon }) => {
          // A parent's "Students" slot is the ward dropdown itself, not a
          // button — there's no single-ward page to link to, just a
          // selection to make (see isWardSlot below).
          const isWardSlot = isParent && id === 'students'
          if (isWardSlot) {
            return (
              <Dropdown
                key={id}
                className="leftnav-ward-dropdown"
                value={selectedWardId}
                placeholder=""
                onChange={handleWardSelect}
                options={wards.map(ward => ({ key: ward.student_id, label: ward.name }))}
              />
            )
          }
          return (
            <button
              key={id}
              className={`leftnav-item ${isActive(id) ? 'leftnav-item--active' : ''}`}
              onClick={() => handleNav(id)}
              aria-label={label}
              aria-current={isActive(id) ? 'page' : undefined}
            >
              {isLoadingById[id] ? <IconSpinner /> : <Icon />}
              <span className="leftnav-item-label">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="leftnav-spacer" />

      <div className="leftnav-info">
        {/* Sys admin always gets it (they can create a new session even
           with no history yet); everyone else only once there's actual
           history to browse — "New session" never appears for them at
           all, only sys admins may create one. Always renders once that
           role check passes — NOT gated on sessions having loaded, since
           hiding the whole block that way broke in practice. Instead, the
           "current" option's key/value share the same 'current' fallback
           (so they always match — no "Select…" placeholder) and its label
           falls back to '' rather than a fabricated word — a blank trigger
           for the split second before real data arrives beats either
           hiding the control or showing text that isn't the real date. */}
        {(profile.is_school_admin || pastSessions.length > 0) && (
          <div className="leftnav-session-block">
            <span className="leftnav-info-label">Session</span>
            <Dropdown
              className="leftnav-session-dropdown"
              value={activeSessionId ?? 'current'}
              onChange={handleSessionChange}
              // Every real session (future, if one's actually been
              // scheduled, then current, then past) in one descending-by-
              // date run, with "New session" — a create action, not a
              // session — anchored last rather than displacing Current
              // from the top just because it's sys-admin-only. Only shown
              // at all once there's no future session already scheduled
              // (there's nothing to create otherwise) and only to a sys
              // admin (the only role that can ever create one).
              options={[
                ...(profile.is_school_admin && futureSession
                  ? [{ key: futureSession.session_id, label: futureSession.label }]
                  : []),
                { key: currentSession?.session_id ?? 'current', label: currentSession?.label ?? '' },
                ...pastSessions.map(sess => ({ key: sess.session_id, label: sess.label })),
                ...(profile.is_school_admin && !futureSession
                  ? [{ key: 'schedule-new', label: 'New session' }]
                  : []),
              ]}
            />
          </div>
        )}
        {infoItems.map(({ label, value }) => (
          <div key={label} className="leftnav-info-block">
            <span className="leftnav-info-label">{label}</span>
            <span className="leftnav-info-value">{value}</span>
          </div>
        ))}
      </div>

      <ScheduleSessionDialog
        open={showSessionDialog}
        onClose={() => setShowSessionDialog(false)}
        // Per spec, a newly created session (staged future, or cut over
        // immediately if the picked date was today/earlier) is necessarily
        // empty — send the super-user straight to the upload screen for
        // it, same one-time nudge as the login-time auto-advance
        // (DashboardQuote.jsx), just triggered directly by this action
        // instead of a timer, so it can never re-fire on its own. Select
        // whichever session is now the relevant one first — the future
        // session if one resulted, else the new current one (an immediate
        // cutover produces no future row at all, and without this the
        // site-wide picker would otherwise keep pointing at the old
        // session, now demoted to past).
        onScheduled={() => {
          const sessions = useSessionsStore.getState().sessions
          const fut = sessions.find(sess => sess.is_future)
          const cur = sessions.find(sess => sess.is_current)
          setActiveSessionId(fut ? fut.session_id : cur?.session_id ?? null)
          navigate('/dashboard/students')
        }}
      />

      <button
        className="leftnav-item leftnav-item--logout"
        onClick={handleLogout}
        aria-label="Logout"
      >
        <IconLogout />
        <span className="leftnav-item-label">Logout</span>
      </button>

    </aside>
  )
}
