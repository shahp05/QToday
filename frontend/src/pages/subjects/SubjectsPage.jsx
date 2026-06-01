import { useState } from 'react'
import { useUI } from '../../context/UIContext'
import { SUBJECTS } from './subjectsData'
import './SubjectsPage.css'

const GRADES   = Array.from({ length: 12 }, (_, i) => i + 1)
const SECTIONS = ['A', 'B', 'C', 'D', 'E']

function IconTeacher() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55z"/>
      <path d="M12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>
    </svg>
  )
}

function IconFetch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5z"/>
    </svg>
  )
}

function SubjectQuery({ subject }) {
  const [topic,   setTopic]   = useState('')
  const [grade,   setGrade]   = useState('')
  const [section, setSection] = useState('')
  const [loading, setLoading] = useState(false)

  function handleFetch() {
    if (!topic || !grade) return
    setLoading(true)
    setTimeout(() => setLoading(false), 800)
  }

  return (
    <div className="subj-query">
      <p className="subj-query-prompt">Which topic did you teach today?</p>
      <div className="subj-query-row">
        <div className="subj-field subj-field--grow">
          <input
            className="subj-input"
            type="text"
            placeholder="Topic name?"
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
        </div>
        <div className="subj-field">
          <select className={`subj-select ${!grade ? 'subj-select--placeholder' : ''}`} value={grade} onChange={e => setGrade(e.target.value)}>
            <option value="">Grade?</option>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <button
          className="subj-fetch-btn"
          onClick={handleFetch}
          disabled={!topic || !grade || loading}
        >
          <IconFetch />
          {loading ? 'Fetching…' : 'Fetch Questions'}
        </button>
      </div>
    </div>
  )
}

export default function SubjectsPage() {
  const { activeSubject } = useUI()
  const subject = SUBJECTS.find(s => s.id === activeSubject)

  if (!activeSubject) {
    return (
      <div className="subjects-detail subjects-detail--empty">
        <div className="subjects-detail-empty-icon">
          <IconTeacher />
        </div>
        <p className="subjects-detail-empty-text">Select the subject you taught today.</p>
      </div>
    )
  }

  return (
    <div className="subjects-detail">
      <div className="content-card">
        <div className="subjects-detail-header">
          <img src={subject?.img} alt={subject?.label} className="subjects-detail-img" draggable={false} />
          <h2 className="content-card-title">{subject?.label}</h2>
        </div>
        <SubjectQuery subject={subject} />
      </div>
    </div>
  )
}
