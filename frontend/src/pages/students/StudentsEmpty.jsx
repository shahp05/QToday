import { useRef, useState } from 'react'
import { useProfileStore } from '../../store/profileStore'
import './StudentsEmpty.css'


const COLUMNS = ['Id', 'Name', 'Grade', 'Section', 'Parent1 Email', 'Parent2 Email']
const SAMPLE  = ['2026-1001', 'Aanya Sharma', '8', 'B', 'parent1@abc.com', 'parent2@abc.com']

const LOGIN_COLUMNS = ['Id', 'User', 'Default Login', 'Default Password']

function IconDrop() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

function IconBrowse() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
    </svg>
  )
}

export default function StudentsEmpty() {
  const acronym = useProfileStore(s => s.customer_acronym)
  const studentLogin = acronym ? `${SAMPLE[0]}@${acronym}` : ''
  const [parent1Email, parent2Email] = [SAMPLE[4], SAMPLE[5]]
  const loginRows = [
    [SAMPLE[0], 'Student',  studentLogin,  studentLogin],
    ['',        'Parent 1', parent1Email,  parent1Email],
    ['',        'Parent 2', parent2Email,  parent2Email],
  ]
  const fileRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  function handleFile(file) {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Please upload an .xlsx or .xls file.')
      return
    }
    setSelectedFile(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="students-empty">

      <p className="students-empty-label">Upload students xlsx in the format below:</p>

      <div className="students-format-table">
        <div className="students-format-row students-format-row--head">
          {COLUMNS.map(col => (
            <span key={col} className="students-format-cell students-format-cell--head">{col}</span>
          ))}
        </div>
        <div className="students-format-row">
          {SAMPLE.map((val, i) => (
            <span key={i} className="students-format-cell">{val}</span>
          ))}
        </div>
      </div>

      <div className="students-upload-row">

        <div
          className={`students-upload-box ${dragging ? 'students-upload-box--drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop student list file here"
        >
          <IconDrop />
          <span className="students-upload-box-text">Drop file here</span>
        </div>

        <div
          className="students-upload-box"
          onClick={() => fileRef.current.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current.click()}
          aria-label="Browse for student list file"
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files[0])} hidden />
          <IconBrowse />
          <span className="students-upload-box-text">Browse file</span>
        </div>

      </div>

      {selectedFile && (
        <p className="students-selected-file">Selected: {selectedFile.name}</p>
      )}

      {selectedFile && (
        <div className="students-upload-actions">
          <button className="students-upload-btn" onClick={() => alert('Upload wired to API shortly')}>
            Upload
          </button>
        </div>
      )}

      <p className="students-note">
        Use xlsx to add students. Login accounts for students and parents will be automatically created as shown below. When they move to the next grade, simply upload a new xlsx with their next grade.
      </p>

      <div className="students-format-table">
        <div className="students-login-row students-format-row--head">
          {LOGIN_COLUMNS.map(col => (
            <span key={col} className="students-format-cell students-format-cell--head">{col}</span>
          ))}
        </div>
        {loginRows.map((row, r) => (
          <div className="students-login-row" key={r}>
            {row.map((val, i) => (
              <span key={i} className="students-format-cell">{val}</span>
            ))}
          </div>
        ))}
      </div>

    </div>
  )
}
