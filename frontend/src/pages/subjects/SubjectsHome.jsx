import { useState } from 'react'
import SubjectsPage from './SubjectsPage'
import TeachLogList from './TeachLogList'

export default function SubjectsHome() {
  const [showList, setShowList] = useState(false)
  const [initialSelection, setInitialSelection] = useState(null)

  if (showList) {
    return (
      <TeachLogList
        onLogNew={() => setShowList(false)}
        initialSelection={initialSelection}
      />
    )
  }
  return (
    <SubjectsPage
      onShowList={() => {
        setInitialSelection(null)
        setShowList(true)
      }}
      onGenerated={selection => {
        setInitialSelection(selection)
        setShowList(true)
      }}
    />
  )
}
