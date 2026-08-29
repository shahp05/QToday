import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageView } from '../../hooks/usePageView'
import { useSubjectsTaughtStore } from '../../store/subjectsTaughtStore'
import SubjectsPage from './SubjectsPage'
import TeachLogList from './TeachLogList'

function initialCalendarMonth() {
  const d = new Date()
  d.setDate(1)
  return d
}

export default function SubjectsHome({ defaultView, isViewingPastSession = false, initialSubjectId = null, initialGradeId = null }) {
  const navigate = useNavigate()
  // Past session (either role, not just admin) defaults to the Teach
  // Calendar Log's calendar tab too — per spec, a teacher browsing history
  // sees "Teach Calendar Log ... for the last session month," the same
  // default an admin already got, just previously only wired for them. A
  // deep-linked subject overrides both of those — it always lands on the
  // subject/topic list (with that subject's QA already showing), never
  // the calendar, regardless of role or session.
  const [view, setView] = usePageView(
    initialSubjectId != null ? 'subjects' : (defaultView === 'teachLog' || isViewingPastSession ? 'log' : 'subjects')
  )
  const showCalendar = view === 'log'
  // A deep-linked subject (TeachersList's "click a subject chip" action)
  // must land on the subject/topic list — same as defaultView === 'teachLog'
  // forces for an admin — regardless of role, since a plain teacher would
  // otherwise default to the empty "Add New Subject" form instead.
  const [showList, setShowList] = useState(defaultView === 'teachLog' || initialSubjectId != null)
  const [logDate, setLogDate] = useState(null)

  // A sys admin may teach subjects too (e.g. a principal) — if nothing's
  // been logged school-wide yet, they need the same "which subject did you
  // teach today?" form a teacher gets by default, not the calendar, or
  // they'd have no way to log their own first subject until someone else
  // logs one first. Corrected once, right after the subjects-taught fetch
  // resolves, the same "adjust state during render" pattern TeachLogList
  // itself uses for auto-expanding the most recent topic — this runs before
  // TeachLogList would ever paint its (now unreachable) empty state, so
  // there's no flash between the two screens. Never applies while browsing
  // a past session — that form logs a NEW subject, a write action history
  // must never expose, regardless of how many (or few) were logged then.
  // Also never applies to a deep-linked subject (initialSubjectId) — that
  // subject is known to exist (it came from an actual teacher's roster of
  // taught subjects), so there's nothing to correct here.
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsExist = useSubjectsTaughtStore(s => s.subjects.length > 0)
  const [didSyncEmptyDefault, setDidSyncEmptyDefault] = useState(false)
  if (!didSyncEmptyDefault && defaultView === 'teachLog' && initialSubjectId == null && subjectsStatus === 'loaded') {
    setDidSyncEmptyDefault(true)
    if (!subjectsExist && !isViewingPastSession) setShowList(false)
  }
  // Lifted up from TeachLogList/TeachLogCalendar so it survives the
  // "New Subject" round trip through SubjectsPage — TeachLogList unmounts
  // whenever showList flips to false, which would otherwise reset which
  // subject/topic/qa or calendar month were showing back to their defaults
  // every time.
  const [selection, setSelection] = useState(null) // { subjectId, topicId, gradeId } | null
  const [calendarMonth, setCalendarMonth] = useState(initialCalendarMonth)

  // A past session is always read-only (see the permission matrix design)
  // — SubjectsPage (the "which subject did you teach today?" logging form)
  // must never be reachable while browsing one, no matter how empty that
  // session's subjects list is, so it's shown unconditionally here instead
  // of gating on showList.
  if (showList || isViewingPastSession) {
    return (
      <TeachLogList
        onBack={() => navigate(-1)}
        readOnly={isViewingPastSession}
        onLogNew={isViewingPastSession ? undefined : () => {
          setLogDate(null)
          setShowList(false)
        }}
        onEmptyDayClick={isViewingPastSession ? undefined : date => {
          setLogDate(date)
          setShowList(false)
        }}
        selection={selection}
        onSelectionChange={setSelection}
        showCalendar={showCalendar}
        onShowCalendarChange={next => setView(next ? 'log' : 'subjects')}
        calendarMonth={calendarMonth}
        onCalendarMonthChange={setCalendarMonth}
        initialSubjectId={initialSubjectId}
        initialGradeId={initialGradeId}
      />
    )
  }
  return (
    <SubjectsPage
      logDate={logDate}
      onShowList={() => setShowList(true)}
      onGenerated={selection => {
        setSelection(selection)
        setLogDate(null)
        setShowList(true)
      }}
    />
  )
}
