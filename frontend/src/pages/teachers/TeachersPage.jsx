import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import { getActiveSession, getActiveSessionKey, useSessionsStore } from '../../store/sessionsStore'
import { usePageView } from '../../hooks/usePageView'
import PageLoading from '../../components/PageLoading'
import EmptyFeatureState from '../../components/EmptyFeatureState'
import TeachersEmpty from './TeachersEmpty'
import TeachersList from './TeachersList'

// Same path/fill as LeftNav's IconTeachers, just rendered larger for the
// empty-state message (see SubjectsRoute's IconSubjectsLarge for the same
// pattern).
function IconTeachersLarge() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55z"/>
      <path d="M12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>
    </svg>
  )
}

// Placeholder copy — real per-case wording still to come.
const NO_TEACHERS_PAST_MESSAGE = 'No teachers were added in this academic session.'

export default function TeachersPage() {
  const navigate = useNavigate()
  usePageView('teachers') // every page-header page names itself in the URL
  // Per spec, this page is reachable for every role in every session — at
  // least one super-admin always exists for an active school account — so
  // there's no visibility gate or redirect here, unlike Students/Subjects
  // (excluding the viewer's own row from the count below can still leave
  // it empty for a past session where they were the only staff member —
  // see the branches near the bottom). The roster gate (list vs. upload
  // vs. empty message) is for whichever session the left nav's picker is
  // actually browsing, same source TeachersList itself reads, so the two
  // can never disagree about whether there's anything to show.
  const activeKey = useSessionsStore(getActiveSessionKey)
  const teachersStatus = useTeachersStore(s => s.bySession[activeKey]?.status ?? 'idle')
  // /teachers/mine includes the signed-in admin's own row (is_sysadm counts
  // as a "teacher" server-side — see get_my_teachers) — so on a customer
  // that's never uploaded a real teacher, this would otherwise be 1, not 0,
  // and the upload screen would never show automatically. Excluding self is
  // what makes "no teachers" mean what it visually looks like.
  const selfUserId = useProfileStore(s => s.user_id)
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
  const teacherCount = useTeachersStore(s =>
    (s.bySession[activeKey]?.teachers ?? []).filter(t => t.user_id !== selfUserId).length
  )
  const [showUpload, setShowUpload] = useState(false)
  const fetchTeachers = useTeachersStore(s => s.fetchTeachers)
  const activeSessionId = useSessionsStore(s => s.activeSessionId)
  const activeSession = useSessionsStore(getActiveSession)
  // A past session is always read-only — uploading must never target
  // history (see the permission matrix design).
  const isViewingPastSession = activeSession != null && !activeSession.is_current && !activeSession.is_future

  // Opens the shared Subjects page with this subject (and, if known, this
  // teacher's own first grade for it — see TeachersList) preselected.
  // SubjectsRoute reads these query params and resolves them to a real
  // topic/grade once the subjects-taught tree is loaded (see TeachLogList).
  function openSubject(subjectId, gradeId) {
    const params = new URLSearchParams({ subject: subjectId })
    if (gradeId != null) params.set('grade', gradeId)
    navigate(`/dashboard/subjects?${params.toString()}`)
  }

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
  // even when it's just the admin's own row. Never for a past session,
  // though — history is read-only (see Academic Sessions condition 4), so
  // there's no upload path to offer even when the admin was the only
  // staff member back then (excluded from their own count, same as
  // current/future).
  if (isSchoolAdmin && teacherCount === 0 && !isViewingPastSession) {
    return (
      <TeachersEmpty
        onUploaded={() => setShowUpload(false)}
        teacherCount={teacherCount}
        onShowList={() => setShowUpload(false)}
      />
    )
  }
  // Past session, nobody but the viewer's own (excluded) row existed back
  // then — the one way this normally-never-empty page can still end up
  // with nothing to list. No upload escape hatch for history, so the
  // passive empty message is all there is to show.
  if (teacherCount === 0 && isViewingPastSession) {
    return <EmptyFeatureState icon={<IconTeachersLarge />} message={NO_TEACHERS_PAST_MESSAGE} />
  }
  return (
    <TeachersList
      onUploadNew={isViewingPastSession ? undefined : () => setShowUpload(true)}
      onBack={() => navigate(-1)}
      onSubjectClick={openSubject}
    />
  )
}
