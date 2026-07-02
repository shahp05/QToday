import { useState } from 'react'
import SubjectsPage from './SubjectsPage'
import TeachLogList from './TeachLogList'

export default function SubjectsHome() {
  const [showList, setShowList] = useState(false)

  if (showList) {
    return <TeachLogList onLogNew={() => setShowList(false)} />
  }
  return <SubjectsPage onShowList={() => setShowList(true)} />
}
