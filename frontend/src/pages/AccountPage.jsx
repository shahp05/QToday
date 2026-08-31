import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { CURRENT_SESSION_KEY, useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { resolveFileUrl, resolveApiError } from '../lib/api'
import { ErrorCode } from '../errors/errorCodes'
import { uploadMyPhoto } from '../services/photoService'
import { changeMyPassword } from '../services/passwordService'
import { fetchMyCustomer, updateMyCustomer } from '../services/customersService'
import { formatDate } from '../lib/dateFormat'
import { useValidation } from '../hooks/useValidation'
import EditablePhoto from '../components/EditablePhoto'
import { Toast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import { usePageView } from '../hooks/usePageView'
import './AccountPage.css'

const TABS = [
  { id: 'accountData', label: 'Account Data' },
  { id: 'changePassword', label: 'Change Password' },
  { id: 'resetPassword', label: 'Reset Password', disabled: true },
  { id: 'billing', label: 'Billing', disabled: true },
]

// Minimal for now — the self-photo-upload gap (spec 1.8), the Change
// Password section (spec 1.9), and — for super-admins only — the Account
// Data tab. Reset Password and Billing are visible per spec's access
// matrix but deferred: their tabs are disabled rather than wired to a
// placeholder screen (no "coming soon" text — the disabled state itself
// says that).
export default function AccountPage() {
  const navigate = useNavigate()
  usePageView('account') // every page-header page names itself in the URL
  const userName = useProfileStore(s => s.user_name)
  const photoUrl = useProfileStore(s => s.photo_url)
  const updateOwnPhoto = useProfileStore(s => s.updateOwnPhoto)
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('accountData')

  async function handleUpload(file) {
    const data = await uploadMyPhoto(file)
    updateOwnPhoto(data.photo_url)
  }

  return (
    <div className="account-page">
      <PageHeader
        title="Account"
        onBack={() => navigate(-1)}
        actions={
          <EditablePhoto
            editable
            thumbClassName="account-photo-thumb"
            placeholderClassName="account-photo-thumb--placeholder"
            name={userName || ''}
            photoUrl={resolveFileUrl(photoUrl)}
            onUpload={handleUpload}
            onError={setError}
          />
        }
        filter={isSchoolAdmin && (
          <div className="account-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`account-tab${tab === t.id ? ' account-tab--active' : ''}`}
                onClick={() => setTab(t.id)}
                disabled={t.disabled}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      />
      <div className="account-page-body">
        {isSchoolAdmin
          ? (tab === 'accountData' ? <AccountDataSection /> : <ChangePasswordSection />)
          : <ChangePasswordSection />}
      </div>
      <Toast message={error} onDismiss={() => setError('')} />
    </div>
  )
}

// ── Field helper — same shape as SignupPage's, kept local since it's the
// only field-grouping this page needs. ─────────────────────────────────────
function Field({ label, required, span, error, children }) {
  return (
    <div className={`su-field${span === 'full' ? ' su-field--full' : ''}${error ? ' su-field--error' : ''}`}>
      <label className="su-label">
        {label}{required && <span className="su-required">*</span>}
      </label>
      {children}
    </div>
  )
}

// Same tick shape/purpose as StudentsEmpty/TeachersEmpty's upload-success
// icon and QuizPage's Submit/Done icon.
function IconCheck() {
  return (
    <svg className="account-success-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const PASSWORD_RULES = {
  current_password: {
    label: 'Current password',
    required: true,
  },
  new_password: {
    label: 'New password',
    required: true,
  },
  confirm_password: {
    label: 'Confirm new password',
    required: true,
    validate: (v, all) => (v === all.new_password ? null : 'Does not match new password'),
  },
}

// Styled to match the upload (StudentsEmpty/TeachersEmpty) and quiz-play
// (QuizPage) screens: no white card — a bare centered column directly on
// the dashboard's dark background, the same lime-fill/hover-to-outline
// button, the same ring spinner swapped in for the button's contents while
// busy, and the same inline tick-for-success / red-text-for-error idiom
// those screens use instead of routing everything through a Toast.
function ChangePasswordSection() {
  const isStudent = useProfileStore(s => s.is_student)
  const isDefaultPassword = useProfileStore(s => s.is_default_password)
  const passwordDateCreated = useProfileStore(s => s.password_date_created)
  const applyPasswordChange = useProfileStore(s => s.applyPasswordChange)

  const rules = isDefaultPassword
    ? { new_password: PASSWORD_RULES.new_password, confirm_password: PASSWORD_RULES.confirm_password }
    : PASSWORD_RULES
  const { errors, validate, clearError, isShaking } = useValidation(rules)

  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [busy, setBusy] = useState(false)
  const [resultError, setResultError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [networkError, setNetworkError] = useState('')

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    clearError(field)
    setResultError('')
    setSuccessMessage('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate(form)) return
    setBusy(true)
    setResultError('')
    setSuccessMessage('')
    try {
      const profile = await changeMyPassword({
        currentPassword: isDefaultPassword ? '' : form.current_password,
        newPassword: form.new_password,
      })
      applyPasswordChange(profile)
      setForm({ current_password: '', new_password: '', confirm_password: '' })
      setSuccessMessage('Your password has been changed.')
    } catch (err) {
      // Network/timeout failures go through the shared Toast, same as every
      // other unexpected system error — a wrong current password or a
      // policy violation is about *this submission* and shows inline next
      // to Save instead, same split StudentsEmpty/TeachersEmpty use between
      // uploadError (Toast) and the inline file-validation message.
      if (err instanceof TypeError) {
        setNetworkError(resolveApiError({ error_code: ErrorCode.FRONTEND_NETWORK_ERROR }))
      } else {
        setResultError(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-section">
      <Toast message={networkError} onDismiss={() => setNetworkError('')} />

      {/* .account-section is itself the row (flex-row/wrap on desktop,
          collapses to flex-column once the two children can't fit side by
          side) — no separate wrapper div. The heading lives inside the
          left column instead of floating above the row as a 3rd sibling,
          so the row only ever has exactly 2 layout children. */}
      <div className="account-col--summary">
        <p className="account-password-label">Change your password</p>

        <div className={`account-status-box${isDefaultPassword ? ' account-status-box--alert' : ''}`}>
            {isDefaultPassword ? (
              <p className="account-password-default-msg">
                You are currently using your default password. Change it now.
              </p>
            ) : passwordDateCreated ? (
              <p className="account-password-status">
                Last changed on {formatDate(new Date(passwordDateCreated))}
              </p>
            ) : null}
          </div>

          <div className="account-box">
            <p className="account-password-policy-title">
              Your password must follow the security policy given below:
            </p>
            <ul className="account-password-policy-list">
              <li>At least 6 characters</li>
              <li>At least 1 letter and 1 number</li>
              {!isStudent && <li>At least 1 special character (e.g. <code>!</code>, <code>@</code>, <code>#</code>)</li>}
            </ul>
          </div>
        </div>

        <div className="account-col--main">
          <form className={`account-password-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleSubmit} noValidate>
            {/* Required to change the password, except while it's still the
                default one — per Account Rules, a default-password user
                isn't asked to re-enter it. */}
            {!isDefaultPassword && (
              <Field label="Current password" required error={!!errors.current_password}>
                <input
                  className="su-input"
                  type="password"
                  autoComplete="current-password"
                  value={form.current_password}
                  onChange={ev => set('current_password', ev.target.value)}
                />
              </Field>
            )}

            <Field label="New password" required error={!!errors.new_password}>
              <input
                className="su-input"
                type="password"
                autoComplete="new-password"
                value={form.new_password}
                onChange={ev => set('new_password', ev.target.value)}
              />
            </Field>

            <Field label="Confirm new password" required error={!!errors.confirm_password}>
              <input
                className="su-input"
                type="password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={ev => set('confirm_password', ev.target.value)}
              />
            </Field>

            <div className="account-actions">
              <button className="account-save-btn" type="submit" disabled={busy}>
                {busy ? <span className="account-spinner" role="status" aria-label="Saving" /> : 'Save Password'}
              </button>
              {resultError && <span className="account-error">{resultError}</span>}
              {successMessage && <span className="account-success"><IconCheck />{successMessage}</span>}
            </div>
          </form>
        </div>
    </div>
  )
}

const CUSTOMER_RULES = {
  customer_name: { label: 'School/Group Name', required: true },
}

const CUSTOMER_FIELDS = {
  customer_name: '',
  customer_address: '',
  customer_city: '',
  customer_state: '',
  customer_zip: '',
  customer_email: '',
  customer_phone: '',
  customer_gstn: '',
}

function customerToForm(customer) {
  const form = {}
  for (const key of Object.keys(CUSTOMER_FIELDS)) form[key] = customer[key] ?? ''
  return form
}

// Super-admin only — shows the signup-time facts that can't be changed
// (spec: "allowed to change any information, except acronym, country and
// the school board") alongside the fields that can, and who/when the
// editable side was last saved. Same visual system as
// ChangePasswordSection (two bordered boxes, lime Save button, ring
// spinner, inline tick/error) — this is meant to be the base the rest of
// the Account page's sections build on.
function AccountDataSection() {
  const currentSession = useSessionsStore(s => s.sessions.find(sess => sess.is_current))
  const teacherCount = useTeachersStore(s => s.bySession[CURRENT_SESSION_KEY]?.teachers.length)
  const studentCount = useStudentsStore(s => s.bySession[CURRENT_SESSION_KEY]?.students.length)
  const [customer, setCustomer] = useState(null)
  const [form, setForm] = useState(CUSTOMER_FIELDS)
  const [busy, setBusy] = useState(false)
  const [resultError, setResultError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [networkError, setNetworkError] = useState('')
  const { errors, validate, clearError, isShaking } = useValidation(CUSTOMER_RULES)
  const isDirty = customer != null && Object.keys(CUSTOMER_FIELDS).some(key => form[key] !== customerToForm(customer)[key])

  useEffect(() => {
    let cancelled = false
    fetchMyCustomer()
      .then(data => {
        if (cancelled) return
        setCustomer(data)
        setForm(customerToForm(data))
      })
      .catch(err => {
        if (!cancelled) {
          setNetworkError(err instanceof TypeError
            ? resolveApiError({ error_code: ErrorCode.FRONTEND_NETWORK_ERROR })
            : err.message)
        }
      })
    return () => { cancelled = true }
  }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    clearError(field)
    setResultError('')
    setSuccessMessage('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!isDirty) return // nothing changed — don't call the API
    if (!validate(form)) return
    setBusy(true)
    setResultError('')
    setSuccessMessage('')
    try {
      const updated = await updateMyCustomer(form)
      setCustomer(updated)
      setSuccessMessage('Account data has been saved.')
    } catch (err) {
      if (err instanceof TypeError) {
        setNetworkError(resolveApiError({ error_code: ErrorCode.FRONTEND_NETWORK_ERROR }))
      } else {
        setResultError(err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-section">
      <Toast message={networkError} onDismiss={() => setNetworkError('')} />

      {/* .account-section is itself the row (flex-row/wrap on desktop,
          collapses to flex-column once the two children can't fit side by
          side) — a Fragment, not an extra wrapper div, is what the
          customer-loaded condition needs here since it's just gating
          which 2 children render, same system as ChangePasswordSection. */}
      {customer && (
        <>
          <div className="account-col--summary">
            <div className="account-box">
              <dl className="account-data-facts">
                <div className="account-data-fact">
                  <dt>Account created on</dt>
                  <dd>{formatDate(new Date(customer.date_created))}</dd>
                </div>
                <div className="account-data-fact">
                  <dt>Last modified</dt>
                  <dd>
                    {formatDate(new Date(customer.date_modified))}
                    {customer.modified_by_name ? ` by ${customer.modified_by_name}` : ''}
                  </dd>
                </div>
                <div className="account-data-fact">
                  <dt>Country</dt>
                  <dd>{customer.country_name}</dd>
                </div>
                <div className="account-data-fact">
                  <dt>Education Board</dt>
                  <dd>{customer.board_name}</dd>
                </div>
                <div className="account-data-fact">
                  <dt>School/Group Acronym</dt>
                  <dd>{customer.customer_acronym}</dd>
                </div>
                {currentSession && (
                  <div className="account-data-fact">
                    <dt>Current Academic Session</dt>
                    <dd>{currentSession.label}</dd>
                  </div>
                )}
                {teacherCount != null && (
                  <div className="account-data-fact">
                    <dt>Teachers</dt>
                    <dd>{teacherCount}</dd>
                  </div>
                )}
                {studentCount != null && (
                  <div className="account-data-fact">
                    <dt>Students</dt>
                    <dd>{studentCount}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div className="account-col--main">
            <form className={`account-data-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleSubmit} noValidate>
              {/* Fixed 2-column grid — every field is exactly one unit
                  wide, Name/Address explicitly span both units (2 field-
                  widths, not an unbounded full row), and the remaining
                  fields simply pair up two-per-row in the order they're
                  listed (City+State, Zip+GSTN, Email+Phone). */}
              <div className="account-data-fields">
                <div className="account-data-field">
                  <Field label="School/Group Name" required error={!!errors.customer_name}>
                    <input className="su-input" type="text" value={form.customer_name}
                      onChange={ev => set('customer_name', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field account-data-field--wide account-data-field--row-start">
                  <Field label="Address">
                    <input className="su-input" type="text" value={form.customer_address}
                      onChange={ev => set('customer_address', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="City">
                    <input className="su-input" type="text" value={form.customer_city}
                      onChange={ev => set('customer_city', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="State">
                    <input className="su-input" type="text" value={form.customer_state}
                      onChange={ev => set('customer_state', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="Zip">
                    <input className="su-input" type="text" value={form.customer_zip}
                      onChange={ev => set('customer_zip', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="GSTN">
                    <input className="su-input" type="text" value={form.customer_gstn}
                      onChange={ev => set('customer_gstn', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="Email">
                    <input className="su-input" type="email" value={form.customer_email}
                      onChange={ev => set('customer_email', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="Phone">
                    <input className="su-input" type="tel" value={form.customer_phone}
                      onChange={ev => set('customer_phone', ev.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="account-actions">
                <button className="account-save-btn" type="submit" disabled={busy || !isDirty}>
                  {busy ? <span className="account-spinner" role="status" aria-label="Saving" /> : 'Save Changes'}
                </button>
                {resultError && <span className="account-error">{resultError}</span>}
                {successMessage && <span className="account-success"><IconCheck />{successMessage}</span>}
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
