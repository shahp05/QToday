import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import { resolveApiError } from '../../lib/api'
import { ErrorCode } from '../../errors/errorCodes'
import './TeachersEmpty.css'


const COLUMNS = ['Id', 'Name', 'Email']
const SAMPLE  = ['T-2026-01', "Riya Ma'm", 'riya.kapoor@abc.com']

const LOGIN_COLUMNS = ['Id', 'User', 'Default Login', 'Default Password']

const FORMAT_ERROR = resolveApiError({ error_code: ErrorCode.XLSX_FORMAT_INVALID })
const VALUE_ERROR = resolveApiError({ error_code: ErrorCode.XLSX_VALUE_MISSING, context: { field: 'email' } })
const FILE_TYPE_ERROR = resolveApiError({ error_code: ErrorCode.XLSX_FILE_TYPE_INVALID })

function duplicateIdError(ids) {
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) return resolveApiError({ error_code: ErrorCode.DUPLICATE_ID, context: { id } })
    seen.add(id)
  }
  return null
}

const CANONICAL_FIELDS = [
  { key: 'id', norm: 'id', required: true },
  { key: 'name', norm: 'name', required: true },
  { key: 'email', norm: 'email', required: true },
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

// Parses one sheet's raw rows, validates headers/required values, returns
// { error } or { ok: true, rows: [{ org_id, name, email }] }.
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
    if (!field) continue // unrecognized extra column — ignored
    if (colMap[field.key] !== undefined) return { error: FORMAT_ERROR }
    colMap[field.key] = c
  }
  for (const field of CANONICAL_FIELDS) {
    if (field.required && colMap[field.key] === undefined) return { error: FORMAT_ERROR }
  }

  const requiredCols = ['id', 'name', 'email'].map(key => colMap[key])
  for (const row of dataRows) {
    if (requiredCols.some(c => isBlank(row[c]))) return { error: VALUE_ERROR }
  }

  const extracted = dataRows.map(row => ({
    org_id: String(row[colMap.id]).trim(),
    name: String(row[colMap.name]).trim(),
    email: String(row[colMap.email]).trim(),
  }))

  const dupError = duplicateIdError(extracted.map(r => r.org_id))
  if (dupError) return { error: dupError }

  return { ok: true, rows: extracted }
}

// Every sheet in the workbook is a teacher roster and must independently pass validation.
function validateWorkbook(workbook) {
  const allRows = []
  const allIds = []
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
    const result = validateRows(rows)
    if (result.error) return result
    allRows.push(...result.rows)
    allIds.push(...result.rows.map(r => r.org_id))
  }
  const dupError = duplicateIdError(allIds)
  if (dupError) return { error: dupError }
  return { ok: true, rows: allRows }
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

export default function TeachersEmpty({ onUploaded, teacherCount, onShowList }) {
  const acronym = useProfileStore(s => s.customer_acronym)
  const uploadAndRefresh = useTeachersStore(s => s.uploadAndRefresh)
  const teacherLogin = acronym ? `${SAMPLE[0]}@${acronym}` : ''
  const loginRows = [
    [SAMPLE[0], 'Teacher', teacherLogin, teacherLogin],
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
      setError(FILE_TYPE_ERROR)
      shake()
      return
    }

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const result = validateWorkbook(workbook)
      if (result.error) {
        setError(result.error)
        shake()
        return
      }

      await uploadAndRefresh(result.rows)
      setError(null)
      onUploaded?.()
    } catch (err) {
      setError(err.message || FORMAT_ERROR)
      shake()
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0], 'drop')
  }

  return (
    <div className="teachers-empty">

      <div className="teachers-empty-header">
        <p className="teachers-empty-label">Upload teachers xlsx in the format below:</p>
        {teacherCount > 0 && (
          <button className="teachers-empty-list-btn" onClick={onShowList}>
            Teachers {teacherCount}
          </button>
        )}
      </div>

      <div className="teachers-format-table">
        <div className="teachers-format-row teachers-format-row--head">
          {COLUMNS.map(col => (
            <span key={col} className="teachers-format-cell teachers-format-cell--head">{col}</span>
          ))}
        </div>
        <div className="teachers-format-row">
          {SAMPLE.map((val, i) => (
            <span key={i} className="teachers-format-cell">{val}</span>
          ))}
        </div>
      </div>

      <div className="teachers-upload-row">

        <div
          className={`teachers-upload-box ${dragging ? 'teachers-upload-box--drag' : ''} ${shaking && source === 'drop' ? 'ui-shake' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop teacher list file here"
        >
          <IconDrop />
          <span className="teachers-upload-box-text">
            {selectedFile && source === 'drop' ? selectedFile.name : 'Drop file here'}
          </span>
          {selectedFile && source === 'drop' && error && (
            <span className="teachers-upload-error">{error}</span>
          )}
        </div>

        <div
          className={`teachers-upload-box ${shaking && source === 'browse' ? 'ui-shake' : ''}`}
          onClick={() => fileRef.current.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current.click()}
          aria-label="Browse for teacher list file"
        >
          <input ref={fileRef} type="file" accept=".xlsx" onChange={e => handleFile(e.target.files[0], 'browse')} hidden />
          <IconBrowse />
          <span className="teachers-upload-box-text">
            {selectedFile && source === 'browse' ? selectedFile.name : 'Browse file'}
          </span>
          {selectedFile && source === 'browse' && error && (
            <span className="teachers-upload-error">{error}</span>
          )}
        </div>

      </div>

      <p className="teachers-note">
        Use xlsx to add teachers. Login accounts for teachers will be automatically created as shown below.
      </p>

      <div className="teachers-format-table">
        <div className="teachers-login-row teachers-format-row--head">
          {LOGIN_COLUMNS.map(col => (
            <span key={col} className="teachers-format-cell teachers-format-cell--head">{col}</span>
          ))}
        </div>
        {loginRows.map((row, r) => (
          <div className="teachers-login-row" key={r}>
            {row.map((val, i) => (
              <span key={i} className="teachers-format-cell">{val}</span>
            ))}
          </div>
        ))}
      </div>

    </div>
  )
}
