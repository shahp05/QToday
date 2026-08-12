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

export default function SubjectsHome({ defaultView }) {
  const navigate = useNavigate()
  const [view, setView] = usePageView(defaultView === 'teachLog' ? 'log' : 'subjects')
  const showCalendar = view === 'log'
  const [showList, setShowList] = useState(defaultView === 'teachLog')
  const [logDate, setLogDate] = useState(null)

  // A sys admin may teach subjects too (e.g. a principal) — if nothing's
  // been logged school-wide yet, they need the same "which subject did you
  // teach today?" form a teacher gets by default, not the calendar, or
  // they'd have no way to log their own first subject until someone else
  // logs one first. Corrected once, right after the subjects-taught fetch
  // resolves, the same "adjust state during render" pattern TeachLogList
  // itself uses for auto-expanding the most recent topic — this runs before
  // TeachLogList would ever paint its (now unreachable) empty state, so
  // there's no flash between the two screens.
  const subjectsStatus = useSubjectsTaughtStore(s => s.status)
  const subjectsExist = useSubjectsTaughtStore(s => s.subjects.length > 0)
  const [didSyncEmptyDefault, setDidSyncEmptyDefault] = useState(false)
  if (!didSyncEmptyDefault && defaultView === 'teachLog' && subjectsStatus === 'loaded') {
    setDidSyncEmptyDefault(true)
    if (!subjectsExist) setShowList(false)
  }
  // Lifted up from TeachLogList/TeachLogCalendar so it survives the
  // "New Subject" round trip through SubjectsPage — TeachLogList unmounts
  // whenever showList flips to false, which would otherwise reset which
  // subject/topic/qa or calendar month were showing back to their defaults
  // every time.
  const [selection, setSelection] = useState(null) // { subjectId, topicId, gradeId } | null
  const [calendarMonth, setCalendarMonth] = useState(initialCalendarMonth)

  if (showList) {
    return (
      <TeachLogList
        onBack={() => navigate(-1)}
        onLogNew={() => {
          setLogDate(null)
          setShowList(false)
        }}
        onEmptyDayClick={date => {
          setLogDate(date)
          setShowList(false)
        }}
        selection={selection}
        onSelectionChange={setSelection}
        showCalendar={showCalendar}
        onShowCalendarChange={next => setView(next ? 'log' : 'subjects')}
        calendarMonth={calendarMonth}
        onCalendarMonthChange={setCalendarMonth}
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
