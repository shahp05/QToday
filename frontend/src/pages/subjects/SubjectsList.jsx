import { useState } from 'react'
import { useUI } from '../../context/UIContext'
import { SUBJECTS as INITIAL_SUBJECTS } from './subjectsData'
import './SubjectsList.css'

function IconRename() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 1.83H5v-.75l9.06-9.06.75.75-9.06 9.06zm15.45-10.45a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
  )
}

function IconX() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  )
}

export default function SubjectsList() {
  const { activeSubject, setActiveSubject } = useUI()
  const [subjects, setSubjects]   = useState(INITIAL_SUBJECTS)
  const [renaming, setRenaming]   = useState(null)
  const [renameVal, setRenameVal] = useState('')

  function startRename(e, id, currentLabel) {
    e.stopPropagation()
    setRenaming(id)
    setRenameVal(currentLabel)
  }

  function commitRename(id) {
    const trimmed = renameVal.trim()
    if (trimmed) {
      setSubjects(prev => prev.map(s => s.id === id ? { ...s, label: trimmed } : s))
    }
    setRenaming(null)
  }

  function cancelRename(e) {
    e && e.stopPropagation()
    setRenaming(null)
  }

  return (
    <div className="subjects-list">
      <ul className="subjects-list-items">
        {subjects.map(({ id, label, img }) => (
          <li
            key={id}
            className={`subject-row ${activeSubject === id ? 'subject-row--active' : ''}`}
            onClick={() => renaming !== id && setActiveSubject(prev => prev === id ? null : id)}
          >
            <img src={img} alt={label} className="subject-row-img" draggable={false} />

            {renaming === id ? (
              <input
                className="subject-row-input"
                value={renameVal}
                autoFocus
                onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  commitRename(id)
                  if (e.key === 'Escape') cancelRename()
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="subject-row-name">{label}</span>
            )}

            {renaming === id ? (
              <span className="subject-row-edit-actions" onClick={e => e.stopPropagation()}>
                <button className="subject-row-btn subject-row-btn--save"   onClick={() => commitRename(id)} aria-label="Save rename"><IconCheck /></button>
                <button className="subject-row-btn subject-row-btn--cancel" onClick={cancelRename}           aria-label="Cancel rename"><IconX /></button>
              </span>
            ) : (
              <button
                className="subject-row-rename"
                onClick={e => startRename(e, id, label)}
                aria-label={`Rename ${label}`}
                title="Rename subject"
              >
                <IconRename />
                <span>Rename</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
