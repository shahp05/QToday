import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SubjectsPage from './SubjectsPage'
import TeachLogList from './TeachLogList'

function initialCalendarMonth() {
  const d = new Date()
  d.setDate(1)
  return d
}

export default function SubjectsHome({ defaultView }) {
  const navigate = useNavigate()
  const [showList, setShowList] = useState(defaultView === 'teachLog')
  const [logDate, setLogDate] = useState(null)

  // Lifted up from TeachLogList/TeachLogCalendar so it survives the
  // "New Subject" round trip through SubjectsPage — TeachLogList unmounts
  // whenever showList flips to false, which would otherwise reset which
  // view (list/calendar), which subject/topic/qa, and which calendar month
  // were showing back to their defaults every time.
  const [showCalendar, setShowCalendar] = useState(defaultView === 'teachLog')
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
        onShowCalendarChange={setShowCalendar}
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
