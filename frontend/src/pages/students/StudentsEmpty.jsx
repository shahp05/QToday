import { useRef, useState } from 'react'
import './StudentsEmpty.css'

const COLUMNS = ['ID', 'Name', 'Grade', 'Section', 'Parent 1 Email', 'Parent 2 Email']

function IconUpload() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

export default function StudentsEmpty() {
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

      <div
        className={`upload-zone ${dragging ? 'upload-zone--drag' : ''} ${selectedFile ? 'upload-zone--ready' : ''}`}
        onClick={() => fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && fileRef.current.click()}
        aria-label="Upload student list"
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => handleFile(e.target.files[0])} hidden />

        <div className="upload-zone-icon"><IconUpload /></div>

        {selectedFile ? (
          <>
            <p className="upload-zone-title upload-zone-title--ready">{selectedFile.name}</p>
            <p className="upload-zone-sub">Click <strong>Upload</strong> below to proceed</p>
          </>
        ) : (
          <>
            <p className="upload-zone-title">Drop student list here</p>
            <p className="upload-zone-sub">or <span className="upload-zone-link">browse</span> — .xlsx only</p>
          </>
        )}
      </div>

      <div className="upload-actions">
        {selectedFile && (
          <button className="btn-upload" onClick={() => alert('Upload wired to API shortly')}>
            Upload
          </button>
        )}
        <button className="btn-template" onClick={() => alert('Template download coming shortly')}>
          Download template
        </button>
      </div>

      <div className="upload-format">
        <span className="upload-format-label">Required columns</span>
        <div className="upload-format-chips">
          {COLUMNS.map(col => (
            <span key={col} className="format-chip">{col}</span>
          ))}
        </div>
      </div>

    </div>
  )
}
