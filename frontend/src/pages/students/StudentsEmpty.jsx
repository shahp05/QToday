import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useProfileStore } from '../../store/profileStore'
import './StudentsEmpty.css'


const COLUMNS = ['Id', 'Name', 'Grade', 'Section', 'Parent1 Email', 'Parent2 Email']
const SAMPLE  = ['2026-1001', 'Aanya Sharma', '8', 'B', 'parent1@abc.com', 'parent2@abc.com']

const LOGIN_COLUMNS = ['Id', 'User', 'Default Login', 'Default Password']

const FORMAT_ERROR = 'Incorrect xlsx format. Check column headings and values.'
const VALUE_ERROR = 'Id, name and grade must be entered.'

const CANONICAL_FIELDS = [
  { key: 'id', norm: 'id', required: true },
  { key: 'name', norm: 'name', required: true },
  { key: 'grade', norm: 'grade', required: true },
  { key: 'section', norm: 'section', required: false },
  { key: 'parent1email', norm: 'parent1email', required: false },
  { key: 'parent2email', norm: 'parent2email', required: false },
]

function normalizeHeader(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function matchField(rawHeader) {
  const norm = normalizeHeader(rawHeader)
  if (!norm) return null
  let best = null
  let bestDist = Infinity
  for (const field of CANONICAL_FIELDS) {
    const dist = levenshtein(norm, field.norm)
    const threshold = Math.max(1, Math.ceil(field.norm.length * 0.34))
    if (dist <= threshold && dist < bestDist) {
      best = field
      bestDist = dist
    }
  }
  return best
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

// Parses raw sheet rows, validates headers/required values, returns { error } or { ok: true }.
function validateRows(rows) {
  const nonEmptyRows = rows.filter(row => row.some(cell => !isBlank(cell)))
  if (nonEmptyRows.length < 2) return { error: FORMAT_ERROR }

  const colCount = Math.max(...nonEmptyRows.map(row => row.length))
  const usedCols = []
  for (let c = 0; c < colCount; c++) {
    if (nonEmptyRows.some(row => !isBlank(row[c]))) usedCols.push(c)
  }

  const [headerRow, ...dataRows] = nonEmptyRows
  const colMap = {}
  for (const c of usedCols) {
    const field = matchField(headerRow[c])
    if (!field || colMap[field.key] !== undefined) return { error: FORMAT_ERROR }
    colMap[field.key] = c
  }
  for (const field of CANONICAL_FIELDS) {
    if (field.required && colMap[field.key] === undefined) return { error: FORMAT_ERROR }
  }

  const requiredCols = ['id', 'name', 'grade'].map(key => colMap[key])
  for (const row of dataRows) {
    if (requiredCols.some(c => isBlank(row[c]))) return { error: VALUE_ERROR }
  }

  return { ok: true }
}

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
  const [source, setSource] = useState(null) // 'drop' | 'browse'
  const [error, setError] = useState(null)
  const [shaking, setShaking] = useState(false)
  const shakeTimer = useRef(null)

  function shake() {
    clearTimeout(shakeTimer.current)
    setShaking(true)
    shakeTimer.current = setTimeout(() => setShaking(false), 450)
  }

  async function handleFile(file, src) {
    if (!file) return
    setSelectedFile(file)
    setSource(src)

    if (!file.name.match(/\.xlsx$/i)) {
      setError('Please upload an .xlsx file.')
      shake()
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      const result = validateRows(rows)
      if (result.error) {
        setError(result.error)
        shake()
        return
      }
      setError(null)
      alert('Success')
    } catch {
      setError(FORMAT_ERROR)
      shake()
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0], 'drop')
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
          className={`students-upload-box ${dragging ? 'students-upload-box--drag' : ''} ${shaking && source === 'drop' ? 'ui-shake' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop student list file here"
        >
          <IconDrop />
          <span className="students-upload-box-text">
            {selectedFile && source === 'drop' ? selectedFile.name : 'Drop file here'}
          </span>
          {selectedFile && source === 'drop' && error && (
            <span className="students-upload-error">{error}</span>
          )}
        </div>

        <div
          className={`students-upload-box ${shaking && source === 'browse' ? 'ui-shake' : ''}`}
          onClick={() => fileRef.current.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current.click()}
          aria-label="Browse for student list file"
        >
          <input ref={fileRef} type="file" accept=".xlsx" onChange={e => handleFile(e.target.files[0], 'browse')} hidden />
          <IconBrowse />
          <span className="students-upload-box-text">
            {selectedFile && source === 'browse' ? selectedFile.name : 'Browse file'}
          </span>
          {selectedFile && source === 'browse' && error && (
            <span className="students-upload-error">{error}</span>
          )}
        </div>

      </div>

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
