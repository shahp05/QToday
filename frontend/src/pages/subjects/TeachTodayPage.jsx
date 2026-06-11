import { useState, useRef, useEffect } from 'react'
import './TeachTodayPage.css'

export default function TeachTodayPage() {
  const [subject, setSubject] = useState('')
  const [submittedSubject, setSubmittedSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [grade, setGrade] = useState('')

  const subjectRef = useRef(null)
  const topicRef   = useRef(null)

  useEffect(() => { subjectRef.current?.focus() }, [])
  useEffect(() => { if (submittedSubject) topicRef.current?.focus() }, [submittedSubject])

  function handleSubjectKey(e) {
    if (e.key === 'Enter' && subject.trim()) {
      setSubmittedSubject(subject.trim())
    }
  }

  return (
    <div className="teach-today">

      <div className="teach-today-row">
        <label className="teach-today-label">Which subject did you teach today?</label>
        <input
          ref={subjectRef}
          className="teach-today-input"
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          onKeyDown={handleSubjectKey}
          placeholder="e.g. Mathematics"
        />
      </div>

      {submittedSubject && (
        <>
          <div className="teach-today-row teach-today-row--inline">
            <div className="teach-today-field">
              <label className="teach-today-label">Which topic in {subject} did you teach?</label>
              <input
                ref={topicRef}
                className="teach-today-input"
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. Quadratic Equations"
              />
            </div>
            <div className="teach-today-field teach-today-field--grade">
              <label className="teach-today-label">Grade</label>
              <input
                className="teach-today-input"
                type="text"
                value={grade}
                onChange={e => setGrade(e.target.value)}
                placeholder="e.g. 9"
              />
            </div>
          </div>

          <div className="teach-today-row">
            <button className="teach-today-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{display:'block',flexShrink:0}}>
                <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7z"/>
              </svg>
              Generate Questions
            </button>
            <p className="teach-today-note">
              The questions will auto create assignments for students to practice.
              Their score will tell you which students have understood the topic and those who need help.
            </p>
          </div>
        </>
      )}

    </div>
  )
}
