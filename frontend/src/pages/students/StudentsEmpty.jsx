import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useProfileStore } from '../../store/profileStore'
import { useStudentsStore } from '../../store/studentsStore'
import { useStudentGradesStore } from '../../store/studentGradesStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { resolveApiError } from '../../lib/api'
import { ErrorCode } from '../../errors/errorCodes'
import Dropdown from '../../components/Dropdown'
import { Toast } from '../../components/ui/Toast'
import './StudentsEmpty.css'


const COLUMNS = ['Id', 'Name', 'Grade', 'Section', 'Parent1 Email', 'Parent2 Email']
const SAMPLE  = ['2026-1001', 'Aanya Sharma', '8', 'B', 'parent1@abc.com', 'parent2@abc.com']

const LOGIN_COLUMNS = ['Id', 'User', 'Default Login', 'Default Password']

const FORMAT_ERROR = resolveApiError({ error_code: ErrorCode.XLSX_FORMAT_INVALID })
const VALUE_ERROR = resolveApiError({ error_code: ErrorCode.XLSX_VALUE_MISSING, context: { field: 'grade' } })
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

// Parses one sheet's raw rows, validates headers/required values, returns
// { error } or { ok: true, rows: [{ org_id, name, grade, section, parent1_email, parent2_email }] }.
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

  const requiredCols = ['id', 'name', 'grade'].map(key => colMap[key])
  for (const row of dataRows) {
    if (requiredCols.some(c => isBlank(row[c]))) return { error: VALUE_ERROR }
  }

  const extracted = dataRows.map(row => ({
    org_id: String(row[colMap.id]).trim(),
    name: String(row[colMap.name]).trim(),
    grade: parseInt(row[colMap.grade], 10),
    section: colMap.section !== undefined && !isBlank(row[colMap.section]) ? String(row[colMap.section]).trim() : null,
    parent1_email: colMap.parent1email !== undefined && !isBlank(row[colMap.parent1email]) ? String(row[colMap.parent1email]).trim() : null,
    parent2_email: colMap.parent2email !== undefined && !isBlank(row[colMap.parent2email]) ? String(row[colMap.parent2email]).trim() : null,
  }))

  // Per spec: grade must be numeric and 1-12. Checked here too (not just
  // server-side) so a typo shows up immediately instead of after a round
  // trip — Number.isInteger also catches non-numeric cells, since
  // parseInt('Five', 10) is NaN, which fails the integer check.
  const badGradeRow = extracted.find(r => !Number.isInteger(r.grade) || r.grade < 1 || r.grade > 12)
  if (badGradeRow) return { error: resolveApiError({ error_code: ErrorCode.GRADE_INVALID, context: { id: badGradeRow.org_id } }) }

  const dupError = duplicateIdError(extracted.map(r => r.org_id))
  if (dupError) return { error: dupError }

  return { ok: true, rows: extracted }
}

// Every sheet in the workbook is a grade roster and must independently pass validation.
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

// Multiple files may be dropped/selected at once — each is independently
// parsed and validated (same per-sheet rules as a single file), then every
// file's rows are pooled into one combined list and cross-checked for an
// id repeated ACROSS files, not just within one file's own sheets — the
// backend itself has no notion of "which file a row came from" (it just
// receives one flat `students` list), so this is the only place that
// duplication could otherwise slip through. All-or-nothing: the first
// file/sheet that fails aborts the whole batch, same as a single file
// always has — there's no partial-upload state to reconcile.
async function validateFiles(files) {
  const allRows = []
  const allIds = []
  for (const file of files) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const result = validateWorkbook(workbook)
    if (result.error) return { error: result.error }
    allRows.push(...result.rows)
    allIds.push(...result.rows.map(r => r.org_id))
  }
  const dupError = duplicateIdError(allIds)
  if (dupError) return { error: dupError }
  return { ok: true, rows: allRows }
}

function filesLabel(files) {
  if (files.length === 0) return ''
  if (files.length === 1) return files[0].name
  return `${files.length} files selected`
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

function IconSpinner() {
  return <span className="students-upload-spinner" role="status" aria-label="Uploading" />
}

function IconCheck() {
  return (
    <svg className="students-upload-success-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Builds the post-upload summary shown in the drop/browse box when the
// list already had students before this upload (see handleFiles below) —
// staying on this screen instead of jumping straight to the list only
// makes sense if it actually tells the teacher/admin what changed.
function summarizeUpload(previousCount, newCount, counts) {
  const created = counts.students_created
  const updated = counts.students_updated
  const deactivated = counts.students_deactivated
  const countChanged = newCount !== previousCount
  const churned = created > 0 || deactivated > 0

  if (!countChanged && !churned && !updated) return 'No change in student list'

  const parts = []
  if (countChanged) {
    parts.push(`You have ${newCount} student${newCount === 1 ? '' : 's'} now.`)
  } else if (churned) {
    if (created > 0) parts.push(`${created} new student${created === 1 ? '' : 's'} added.`)
    if (deactivated > 0) parts.push(`${deactivated} student${deactivated === 1 ? '' : 's'} discontinued.`)
  }
  if (updated > 0) {
    parts.push(`Data updated for ${updated} student${updated === 1 ? '' : 's'}.`)
  }
  return parts.join(' ')
}

export default function StudentsEmpty({ onUploaded, studentCount, onShowList }) {
  const acronym = useProfileStore(s => s.customer_acronym)
  const uploadAndRefresh = useStudentsStore(s => s.uploadAndRefresh)
  const futureSession = useSessionsStore(s => s.sessions.find(sess => sess.is_future))
  const currentSession = useSessionsStore(s => s.sessions.find(sess => sess.is_current))
  // 'current' | 'future' — this screen only ever uploads into one of those
  // two, never a past session (uploading must never target history). The
  // shared site-wide selection can be a past session (browsed read-only
  // elsewhere), which this screen has no use for — clamped to 'current'
  // here so its own dropdown/upload target never lands on it.
  const activeSession = useSessionsStore(getActiveSession)
  const uploadTarget = activeSession?.is_future ? 'future' : 'current'
  const setActiveSessionId = useSessionsStore(s => s.setActiveSessionId)
  function setUploadTarget(target) {
    const session = target === 'future' ? futureSession : currentSession
    if (session) setActiveSessionId(session.session_id)
  }
  // studentGrades.length, not students.length — the latter is every active
  // account at the school regardless of session (see StudentsPage.jsx's
  // studentCount comment); studentGrades is the future session's actual
  // strictly-scoped roster.
  const futureRosterCount = useStudentGradesStore(s => (s.bySession[futureSession?.session_id] ?? []).length)
  const viewedCount = uploadTarget === 'future' && futureSession ? futureRosterCount : studentCount

  const studentLogin = acronym ? `${SAMPLE[0]}@${acronym}` : ''
  const [parent1Email, parent2Email] = [SAMPLE[4], SAMPLE[5]]
  const loginRows = [
    [SAMPLE[0], 'Student',  studentLogin,  studentLogin],
    ['',        'Parent 1', parent1Email,  parent1Email],
    ['',        'Parent 2', parent2Email,  parent2Email],
  ]
  const fileRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [source, setSource] = useState(null) // 'drop' | 'browse'
  const [error, setError] = useState(null)
  // Validation errors (file type, xlsx format/values) render inline next to
  // the file card above — they're about *this file*. Network/server errors
  // from the actual upload go through the shared Toast instead, same as
  // every other system error in the app.
  const [uploadError, setUploadError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [shaking, setShaking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const shakeTimer = useRef(null)

  function shake() {
    clearTimeout(shakeTimer.current)
    setShaking(true)
    shakeTimer.current = setTimeout(() => setShaking(false), 450)
  }

  async function handleFiles(fileList, src) {
    const files = Array.from(fileList || [])
    if (files.length === 0 || uploading) return
    setSelectedFiles(files)
    setSource(src)
    setSuccessMessage('')

    const badFile = files.find(f => !f.name.match(/\.xlsx$/i))
    if (badFile) {
      setError(FILE_TYPE_ERROR)
      shake()
      return
    }

    try {
      const result = await validateFiles(files)
      if (result.error) {
        setError(result.error)
        shake()
        return
      }

      setUploading(true)
      setError(null)
      const previousCount = viewedCount
      const targetSessionId = uploadTarget === 'future' && futureSession ? futureSession.session_id : null
      // uploadAndRefresh already refetches exactly the session written to
      // (see studentsStore.js) and caches it under the matching key, so
      // there's nothing further to refresh here.
      const counts = await uploadAndRefresh(result.rows, targetSessionId)
      const newCount = (useStudentGradesStore.getState().bySession[targetSessionId ?? CURRENT_SESSION_KEY] ?? []).length
      if (previousCount === 0) {
        // Covers both a brand new customer's current-session upload AND a
        // future session's very first roster upload — either way, the
        // viewed target had nothing in it before this upload, so jumping
        // to the list is the right move. StudentsList reads the same
        // sessionsStore selection this screen does, so it lands on
        // whichever session (current or future) was actually just uploaded.
        onUploaded?.()
      } else {
        // Staying on this screen is the point here — jumping straight to
        // the list wouldn't tell the teacher/admin what this upload
        // actually changed for a roster that already existed.
        setSuccessMessage(summarizeUpload(previousCount, newCount, counts))
      }
    } catch (err) {
      setUploadError(err.message || FORMAT_ERROR)
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files, 'drop')
  }

  const sessionTargetLabel = uploadTarget === 'future' && futureSession
    ? `New Academic Session ${futureSession.label}`
    : currentSession
      ? `Current Academic Session ${currentSession.label}`
      : null

  return (
    <div className="students-empty">

      <Toast message={uploadError} onDismiss={() => setUploadError('')} />

      <div className="students-empty-header">
        <p className="students-empty-label">Upload students xlsx in the format below:</p>
        {futureSession && (
          <Dropdown
            className="students-empty-session-dropdown"
            value={uploadTarget}
            onChange={setUploadTarget}
            options={[
              { key: 'current', label: currentSession ? `Current — ${currentSession.label}` : 'Current session' },
              { key: 'future', label: `New session — starts ${futureSession.label}` },
            ]}
          />
        )}
        {viewedCount > 0 && (
          <button className="students-empty-list-btn" onClick={onShowList}>
            Students {viewedCount}
          </button>
        )}
      </div>

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
          aria-label="Drop student list file(s) here"
        >
          {uploading && source === 'drop' ? <IconSpinner /> : <IconDrop />}
          <span className="students-upload-box-text">
            {uploading && source === 'drop'
              ? 'Uploading…'
              : selectedFiles.length > 0 && source === 'drop' ? filesLabel(selectedFiles) : 'Drop file(s) here'}
          </span>
          {selectedFiles.length > 0 && source === 'drop' && error ? (
            <span className="students-upload-error">{error}</span>
          ) : sessionTargetLabel ? (
            <span className="students-upload-error">{sessionTargetLabel}</span>
          ) : null}
          {selectedFiles.length > 0 && source === 'drop' && !error && successMessage && (
            <span className="students-upload-success"><IconCheck />{successMessage}</span>
          )}
        </div>

        <div
          className={`students-upload-box ${shaking && source === 'browse' ? 'ui-shake' : ''}`}
          onClick={() => fileRef.current.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && fileRef.current.click()}
          aria-label="Browse for student list file(s)"
        >
          <input ref={fileRef} type="file" accept=".xlsx" multiple onChange={e => handleFiles(e.target.files, 'browse')} hidden />
          {uploading && source === 'browse' ? <IconSpinner /> : <IconBrowse />}
          <span className="students-upload-box-text">
            {uploading && source === 'browse'
              ? 'Uploading…'
              : selectedFiles.length > 0 && source === 'browse' ? filesLabel(selectedFiles) : 'Browse file(s)'}
          </span>
          {selectedFiles.length > 0 && source === 'browse' && error ? (
            <span className="students-upload-error">{error}</span>
          ) : sessionTargetLabel ? (
            <span className="students-upload-error">{sessionTargetLabel}</span>
          ) : null}
          {selectedFiles.length > 0 && source === 'browse' && !error && successMessage && (
            <span className="students-upload-success"><IconCheck />{successMessage}</span>
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
