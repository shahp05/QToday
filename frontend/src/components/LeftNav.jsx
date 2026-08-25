import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { CURRENT_SESSION_KEY, useSessionsStore } from '../store/sessionsStore'
import { useParentWardStore } from '../store/parentWardStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useSubjectsTaughtStore } from '../store/subjectsTaughtStore'
import { useDashboardQuoteStore } from '../store/dashboardQuoteStore'
import { resetUserScopedStores } from '../store/resetUserScopedStores'
import Dropdown from './Dropdown'
import ScheduleSessionDialog from './ScheduleSessionDialog'
import WardPickerDialog from './WardPickerDialog'
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
  // A parent's Subjects view lives under the repurposed "Students" button
  // instead (see the parent ward button below) — the site subjects nav
  // item itself (teach-log browsing) has no meaning for them.
  { id: 'subjects',  label: 'Subjects',  Icon: IconSubjects, visible: p => !p.is_parent },
  // Only the customer's sys admin (uploads/manages the roster) and its
  // teachers (view it) have any use for the roster page itself — a student
  // only has their own row. A parent gets this same button repurposed as
  // their selected ward's photo/name (see the render loop below) rather
  // than the roster page, so it's visible to them too.
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
  // be at a different school. A single ward auto-selects silently; more than
  // one opens a picker popup from the repurposed "Students" button (see the
  // render loop and WardPickerDialog below) instead of navigating anywhere.
  const isParent = profile.is_parent
  const wards = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.students ?? EMPTY_ARRAY)
  const selectedWardId = useParentWardStore(s => s.selectedStudentId)
  const setSelectedWardId = useParentWardStore(s => s.setSelectedStudentId)
  const selectedWard = wards.find(w => w.student_id === selectedWardId) ?? null
  const clearTeachersCache = useTeachersStore(s => s.clearTeachers)
  const fetchTeachersForWard = useTeachersStore(s => s.fetchTeachers)
  const clearSubjectsCache = useSubjectsTaughtStore(s => s.clearSubjectsTaught)
  const fetchSubjectsForWard = useSubjectsTaughtStore(s => s.fetchSubjectsTaught)
  const [showWardPicker, setShowWardPicker] = useState(false)

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

  function handleNav(id) {
    // The "Students" button is repurposed for a parent into a ward
    // display/switcher, not a link to the (admin-only) roster page — it
    // opens the picker when there's an actual choice, otherwise does
    // nothing (a single ward has nothing to switch to).
    if (isParent && id === 'students') {
      if (wards.length > 1) setShowWardPicker(true)
      return
    }
    if (isActive(id)) return
    navigate(`/dashboard/${id}`)
  }

  function handleLogout() {
    clearProfile()
    resetUserScopedStores()
    resetQuoteAutoAdvance()
    navigate('/')
  }

  return (
    <aside className="leftnav" aria-label="Main navigation">

      <div className="leftnav-logo-cell">
        <img src={logo} alt="QToday" className="leftnav-logo-img" />
      </div>

      <nav className="leftnav-items">
        {NAV_ITEMS.filter(item => !item.visible || item.visible(profile)).map(({ id, label, Icon }) => {
          // A parent's "Students" button shows the selected ward's own
          // photo/name instead of the generic icon/label — same button,
          // same size, just standing in for a page this role doesn't have.
          const isWardButton = isParent && id === 'students'
          const buttonLabel = isWardButton ? (selectedWard?.name || label) : label
          return (
            <button
              key={id}
              className={`leftnav-item ${isActive(id) ? 'leftnav-item--active' : ''}`}
              onClick={() => handleNav(id)}
              aria-label={buttonLabel}
              aria-current={isActive(id) ? 'page' : undefined}
            >
              {isWardButton ? (
                selectedWard?.photo_url
                  ? <img src={selectedWard.photo_url} alt="" className="leftnav-item-ward-photo" />
                  : <IconStudents />
              ) : (
                isLoadingById[id] ? <IconSpinner /> : <Icon />
              )}
              <span className="leftnav-item-label">{buttonLabel}</span>
            </button>
          )
        })}
      </nav>

      <div className="leftnav-spacer" />

      <div className="leftnav-info">
        {/* Sys admin always gets it (they can create a new session even
           with no history yet); everyone else only once there's actual
           history to browse — "New session" never appears for them at
           all, only sys admins may create one. */}
        {(profile.is_school_admin || pastSessions.length > 0) && (
          <div className="leftnav-session-block">
            <span className="leftnav-info-label">Session</span>
            <Dropdown
              className="leftnav-session-dropdown"
              // Falls back to the same 'current' placeholder key the first
              // option below uses whenever sessions haven't loaded yet
              // (activeSessionId starts null) — without this, that brief
              // window has value=null matching no option's key, and
              // Dropdown shows its own "Select…" placeholder instead of
              // Current, even though Current is always the actual default.
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
                { key: currentSession?.session_id ?? 'current', label: currentSession?.label || 'Current' },
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
        onScheduled={() => {
          const fut = useSessionsStore.getState().sessions.find(sess => sess.is_future)
          if (fut) setActiveSessionId(fut.session_id)
        }}
      />

      {isParent && (
        <WardPickerDialog
          open={showWardPicker}
          wards={wards}
          selectedWardId={selectedWardId}
          onSelect={setSelectedWardId}
          onClose={() => setShowWardPicker(false)}
        />
      )}

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
