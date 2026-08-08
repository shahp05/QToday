import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePageView } from '../../hooks/usePageView'
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
