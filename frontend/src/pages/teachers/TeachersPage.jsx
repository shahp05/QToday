import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { usePageView } from '../../hooks/usePageView'
import PageLoading from '../../components/PageLoading'
import TeachersEmpty from './TeachersEmpty'
import TeachersList from './TeachersList'

export default function TeachersPage() {
  const navigate = useNavigate()
  usePageView('teachers') // every page-header page names itself in the URL
  // The top-level "does this school have any teachers at all" gate is
  // always about the LIVE current session, regardless of what the left
  // nav's session picker happens to be browsing — that's TeachersList's
  // own concern (it reads the active session directly).
  const teachersStatus = useTeachersStore(s => s.bySession[CURRENT_SESSION_KEY]?.status ?? 'idle')
  // /teachers/mine includes the signed-in admin's own row (is_sysadm counts
  // as a "teacher" server-side — see get_my_teachers) — so on a customer
  // that's never uploaded a real teacher, this would otherwise be 1, not 0,
  // and the upload screen would never show automatically. Excluding self is
  // what makes "no teachers" mean what it visually looks like.
  const selfUserId = useProfileStore(s => s.user_id)
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
  const teacherCount = useTeachersStore(s =>
    (s.bySession[CURRENT_SESSION_KEY]?.teachers ?? []).filter(t => t.user_id !== selfUserId).length
  )
  const [showUpload, setShowUpload] = useState(false)
  const fetchTeachers = useTeachersStore(s => s.fetchTeachers)
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const activeSession = useSessionsStore(getActiveSession)
  // A past session is always read-only — uploading must never target
  // history (see the permission matrix design).
  const isViewingPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Kept fetched here, not inside TeachersEmpty — TeachersEmpty doesn't
  // mount at all when the current roster is non-empty, so an eager fetch
  // there would miss that (common) path. fetchTeachers itself resolves
  // whether activeSessionId is actually current and whether the signed-in
  // role is even allowed to browse a different one.
  useEffect(() => {
    fetchTeachers(activeSessionId)
  }, [activeSessionId, fetchTeachers])

  // Checked before the loading guard below — TeachersEmpty owns its own
  // loading/spinner state (including while uploadAndRefresh briefly flips
  // teachersStatus back to 'loading' mid-upload) and must not be swapped
  // out for the generic placeholder while it's doing that.
  if (showUpload) {
    return (
      <TeachersEmpty
        onUploaded={() => setShowUpload(false)}
        teacherCount={teacherCount}
        onShowList={() => setShowUpload(false)}
      />
    )
  }

  // No header yet — whether this page ends up as the list or the xlsx
  // upload screen (which has no header at all) isn't known until the
  // roster status settles, so showing "Teachers" + a back button here would
  // just flash and then disappear the moment teacherCount turns out to be 0.
  if (teachersStatus === 'idle' || teachersStatus === 'loading') {
    return <PageLoading />
  }

  // Only the sys admin can actually upload (the backend rejects anyone
  // else's POST /teachers/upload), so they're the only one who ever gets
  // the upload screen as a default — everyone else always sees the list,
  // even when it's just the admin's own row.
  if (isSchoolAdmin && teacherCount === 0) {
    return (
      <TeachersEmpty
        onUploaded={() => setShowUpload(false)}
        teacherCount={teacherCount}
        onShowList={() => setShowUpload(false)}
      />
    )
  }
  return (
    <TeachersList
      onUploadNew={isViewingPastSession ? undefined : () => setShowUpload(true)}
      onBack={() => navigate(-1)}
    />
  )
}
