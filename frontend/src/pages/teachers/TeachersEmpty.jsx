import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useProfileStore } from '../../store/profileStore'
import { useTeachersStore } from '../../store/teachersStore'
import { CURRENT_SESSION_KEY, getActiveSession, useSessionsStore } from '../../store/sessionsStore'
import { resolveApiError } from '../../lib/api'
import { ErrorCode } from '../../errors/errorCodes'
import Dropdown from '../../components/Dropdown'
import { Toast } from '../../components/ui/Toast'
import './TeachersEmpty.css'


const COLUMNS = ['Id', 'Name', 'Email']
const SAMPLE  = ['T-2026-01', "Riya Ma'm", 'riya.kapoor@abc.com']

const LOGIN_COLUMNS = ['Id', 'Default Login', 'Default Password']

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

function IconSpinner() {
  return <span className="teachers-upload-spinner" role="status" aria-label="Uploading" />
}

function IconCheck() {
  return (
    <svg className="teachers-upload-success-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// Builds the post-upload summary shown in the drop/browse box when the
// list already had teachers before this upload (see handleFile below) —
// staying on this screen instead of jumping straight to the list only
// makes sense if it actually tells the admin what changed.
function summarizeUpload(previousCount, newCount, counts) {
  const created = counts.teachers_created
  const updated = counts.teachers_updated
  const deactivated = counts.teachers_deactivated
  const countChanged = newCount !== previousCount
  const churned = created > 0 || deactivated > 0

  if (!countChanged && !churned && !updated) return 'No change in teacher list'

  const parts = []
  if (countChanged) {
    parts.push(`You have ${newCount} teacher${newCount === 1 ? '' : 's'} now.`)
  } else if (churned) {
    if (created > 0) parts.push(`${created} new teacher${created === 1 ? '' : 's'} added.`)
    if (deactivated > 0) parts.push(`${deactivated} teacher${deactivated === 1 ? '' : 's'} discontinued.`)
  }
  if (updated > 0) {
    parts.push(`Data updated for ${updated} teacher${updated === 1 ? '' : 's'}.`)
  }
  return parts.join(' ')
}

export default function TeachersEmpty({ onUploaded, teacherCount, onShowList }) {
  const acronym = useProfileStore(s => s.customer_acronym)
  // Matches the exclusion TeachersPage already applies to the teacherCount
  // prop — needed again here so the post-upload count in summarizeUpload
  // stays consistent with it (self is never in the uploaded rows, but is
  // always in the raw refetched count).
  const selfUserId = useProfileStore(s => s.user_id)
  const uploadAndRefresh = useTeachersStore(s => s.uploadAndRefresh)
  const futureSession = useSessionsStore(s => s.sessions.find(sess => sess.is_future))
  const currentSession = useSessionsStore(s => s.sessions.find(sess => sess.is_current))
  // 'current' | 'future' — this screen only ever uploads into one of those
  // two, never a past session. The shared site-wide selection can be a
  // past session (browsed read-only elsewhere), which this screen has no
  // use for — clamped to 'current' here, same pattern as StudentsEmpty.
  const activeSession = useSessionsStore(getActiveSession)
  const uploadTarget = activeSession?.is_future ? 'future' : 'current'
  const setActiveSessionId = useSessionsStore(s => s.setActiveSessionId)
  function setUploadTarget(target) {
    const session = target === 'future' ? futureSession : currentSession
    if (session) setActiveSessionId(session.session_id)
  }
  // teachers[].length, not the raw prop — the prop is always the current
  // session's count (see TeachersPage.jsx); this screen needs whichever
  // target is actually being viewed, same reasoning as StudentsEmpty's
  // futureRosterCount/viewedCount.
  const futureRosterCount = useTeachersStore(s => (s.bySession[futureSession?.session_id]?.teachers ?? []).length)
  const viewedCount = uploadTarget === 'future' && futureSession ? futureRosterCount : teacherCount
  const teacherLogin = acronym ? `${SAMPLE[0]}@${acronym}` : ''
  const loginRows = [
    [SAMPLE[0], teacherLogin, teacherLogin],
  ]
  const fileRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
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

  async function handleFile(file, src) {
    if (!file || uploading) return
    setSelectedFile(file)
    setSource(src)
    setSuccessMessage('')

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

      setUploading(true)
      setError(null)
      const previousCount = viewedCount
      const targetSessionId = uploadTarget === 'future' && futureSession ? futureSession.session_id : null
      // uploadAndRefresh already refetches exactly the session written to
      // and caches it under the matching key, so there's nothing further
      // to refresh here (see teachersStore.js).
      const counts = await uploadAndRefresh(result.rows, targetSessionId)
      const newCount = (useTeachersStore.getState().bySession[targetSessionId ?? CURRENT_SESSION_KEY]?.teachers ?? [])
        .filter(t => t.user_id !== selfUserId).length
      if (previousCount === 0) {
        // Covers both a brand new customer's current-session upload AND a
        // future session's first staged hire — either way, the viewed
        // target had nothing in it before this upload, so jumping to the
        // list is the right move.
        onUploaded?.()
      } else {
        // Staying on this screen is the point here — jumping straight to
        // the list wouldn't tell the admin what this upload actually
        // changed for a roster that already existed.
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
    handleFile(e.dataTransfer.files[0], 'drop')
  }

  const sessionTargetLabel = uploadTarget === 'future' && futureSession
    ? `New Academic Session ${futureSession.label}`
    : currentSession
      ? `Current Academic Session ${currentSession.label}`
      : null

  return (
    <div className="teachers-empty">

      <Toast message={uploadError} onDismiss={() => setUploadError('')} />

      <div className="teachers-empty-header">
        <p className="teachers-empty-label">Upload teachers xlsx in the format below:</p>
        {futureSession && (
          <Dropdown
            className="teachers-empty-session-dropdown"
            value={uploadTarget}
            onChange={setUploadTarget}
            options={[
              { key: 'current', label: currentSession ? `Current — ${currentSession.label}` : 'Current session' },
              { key: 'future', label: `New session — starts ${futureSession.label}` },
            ]}
          />
        )}
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
          {uploading && source === 'drop' ? <IconSpinner /> : <IconDrop />}
          <span className="teachers-upload-box-text">
            {uploading && source === 'drop'
              ? 'Uploading…'
              : selectedFile && source === 'drop' ? selectedFile.name : 'Drop file here'}
          </span>
          {selectedFile && source === 'drop' && error ? (
            <span className="teachers-upload-error">{error}</span>
          ) : sessionTargetLabel ? (
            <span className="teachers-upload-error">{sessionTargetLabel}</span>
          ) : null}
          {selectedFile && source === 'drop' && !error && successMessage && (
            <span className="teachers-upload-success"><IconCheck />{successMessage}</span>
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
          {uploading && source === 'browse' ? <IconSpinner /> : <IconBrowse />}
          <span className="teachers-upload-box-text">
            {uploading && source === 'browse'
              ? 'Uploading…'
              : selectedFile && source === 'browse' ? selectedFile.name : 'Browse file'}
          </span>
          {selectedFile && source === 'browse' && error ? (
            <span className="teachers-upload-error">{error}</span>
          ) : sessionTargetLabel ? (
            <span className="teachers-upload-error">{sessionTargetLabel}</span>
          ) : null}
          {selectedFile && source === 'browse' && !error && successMessage && (
            <span className="teachers-upload-success"><IconCheck />{successMessage}</span>
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
