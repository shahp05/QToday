import { useState } from 'react'
import SubjectsPage from './SubjectsPage'
import TeachLogList from './TeachLogList'

export default function SubjectsHome() {
  const [showList, setShowList] = useState(false)
  const [initialSelection, setInitialSelection] = useState(null)
  const [logDate, setLogDate] = useState(null)

  if (showList) {
    return (
      <TeachLogList
        onLogNew={() => {
          setLogDate(null)
          setShowList(false)
        }}
        onEmptyDayClick={date => {
          setLogDate(date)
          setShowList(false)
        }}
        initialSelection={initialSelection}
      />
    )
  }
  return (
    <SubjectsPage
      logDate={logDate}
      onShowList={() => {
        setInitialSelection(null)
        setShowList(true)
      }}
      onGenerated={selection => {
        setInitialSelection(selection)
        setLogDate(null)
        setShowList(true)
      }}
    />
  )
}
