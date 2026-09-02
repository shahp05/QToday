import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { CURRENT_SESSION_KEY, useSessionsStore } from '../store/sessionsStore'
import { useStudentsStore } from '../store/studentsStore'
import { useTeachersStore } from '../store/teachersStore'
import { useAccountStore } from '../store/accountStore'
import { resolveFileUrl, resolveApiError } from '../lib/api'
import { ErrorCode } from '../errors/errorCodes'
import { uploadMyPhoto } from '../services/photoService'
import { changeMyPassword } from '../services/passwordService'
import { updateMyCustomer } from '../services/customersService'
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
  { id: 'billing', label: 'Billing', disabled: true },
]

// Minimal for now — the self-photo-upload gap (spec 1.8), the Change
// Password section (spec 1.9), and — for super-admins only — the Account
// Data tab. Billing is visible per spec's access matrix but deferred: its
// tab is disabled rather than wired to a placeholder screen (no "coming
// soon" text — the disabled state itself says that).
export default function AccountPage() {
  const navigate = useNavigate()
  const location = useLocation()
  usePageView('account') // every page-header page names itself in the URL
  const userName = useProfileStore(s => s.user_name)
  const photoUrl = useProfileStore(s => s.photo_url)
  const updateOwnPhoto = useProfileStore(s => s.updateOwnPhoto)
  const isSchoolAdmin = useProfileStore(s => s.is_school_admin)
  const [error, setError] = useState('')
  // The default-password Toast (Dashboard.jsx) links here with
  // state:{tab:'changePassword'} so it opens straight to that tab instead
  // of the usual Account Data default.
  const [tab, setTab] = useState(location.state?.tab === 'changePassword' ? 'changePassword' : 'accountData')

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

// Same shape as TeachLogList's IconChevron, without the open/rotate prop —
// these boxes navigate to a click target rather than expand in place, so
// the chevron always just points right.
function IconChevronRight() {
  return (
    <svg className="account-box-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

// Marks a box as informational rather than a click target — the reset-
// password box for a student, who can only raise that request from the
// login page, not from here.
function IconInfo() {
  return (
    <svg className="account-box-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
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
    label: 'Current Password',
    required: true,
  },
  new_password: {
    label: 'New Password',
    required: true,
    // Only catches the case where the current password was actually typed
    // (a default password isn't — see the !isDefaultPassword branch below
    // — so there's nothing on the client to compare against there; that
    // case would need a server-side check instead).
    validate: (v, all) => (all.current_password && v === all.current_password ? 'Must be different from your current password' : null),
  },
  confirm_password: {
    label: 'Confirm New Password',
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
  const isParent = useProfileStore(s => s.is_parent)
  const isSchoolTeacher = useProfileStore(s => s.is_school_teacher)
  const isDefaultPassword = useProfileStore(s => s.is_default_password)
  const passwordDateCreated = useProfileStore(s => s.password_date_created)
  const applyPasswordChange = useProfileStore(s => s.applyPasswordChange)
  const userName = useProfileStore(s => s.user_name)
  const customerAcronym = useProfileStore(s => s.customer_acronym)

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

  // TODO: source from the backend once the reset-request endpoint exists
  // — there's no reset-request data anywhere yet, so this stays 0 (count
  // hidden, click a no-op) until that's built.
  const resetRequestCount = 0

  // Which of the two left cards' content shows in the right column —
  // clicking Change Password swaps back, clicking Reset Password (once
  // there's actually a request to look at) swaps to its message.
  const [activeSection, setActiveSection] = useState('changePassword')

  function handleChangePasswordBoxClick() {
    setActiveSection('changePassword')
  }
  function handleResetPasswordBoxClick() {
    setActiveSection('resetPassword')
  }

  // is_school_teacher covers admins and super-admins too (a super-admin's
  // claims always include the teacher one — see isSchoolAdmin-implies-
  // isSchoolTeacher elsewhere on this page), so one check reads for all of
  // them; only parent/student need their own wording.
  // Same parent/teacher split as resetRequestMessage above, for the right
  // column's info-group label ("Wards" vs "Students").
  const resetGroupLabel = isParent ? 'Wards' : 'Students'

  const resetRequestMessage = isParent
    ? 'If your wards raise a request to reset their password, the request will be listed here. Their password will be reset to default when you approve.'
    : isStudent
    ? 'If you request for password reset at the time of login, your request will be sent to your teachers and parents and only they can reset the password.'
    : isSchoolTeacher
    ? 'If your students raise a request to reset their password, the request will be listed here. Their password will be reset to default when you approve.'
    : null

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
    // .account-scroll-content is always flex-column (unconditionally, not
    // dependent on the row/column toggle inside it) so the bottom spacer
    // always lands below .account-section regardless of that toggle's
    // state — see the spacer's own comment for why it's a real element
    // rather than padding-bottom on the scrolling ancestor.
    <div className="account-scroll-content">
      <Toast message={networkError} onDismiss={() => setNetworkError('')} />

      {/* .account-section is itself the row (row on desktop, column once
          the two children can't fit side by side — see the @container
          rule): the left column (status + role-specific reset-request
          box, same two-box layout as AccountDataSection's own left
          column) and the right column (the form). */}
      <div className="account-section">
      <div className="account-col--summary">
        {/* Both options live in one box as rows now, instead of two
            separate cards — the green left-border accent on the active row
            tracks which one's content is showing in the right column, same
            idiom as .account-tab--active applied per-row. */}
        <div className="account-status-box account-options-box">
          <button
            type="button"
            className={`account-option-row${activeSection === 'changePassword' ? ' account-option-row--active' : ''}`}
            onClick={handleChangePasswordBoxClick}
          >
            <span className="account-box-title">Change your password</span>
            <IconChevronRight />
          </button>

          {/* A student can only raise this request from the login page, not
              from here — this row is informational for them (info icon, no
              click, message stays here), while a teacher/parent clicks
              through to act on it (chevron, request count) and see its
              message in the right column instead of on this row. */}
          {resetRequestMessage && (isStudent ? (
            <div className="account-option-row account-option-row--info">
              <div className="account-clickable-content">
                <div className="account-clickable-heading">
                  <span className="account-box-title">Reset Password</span>
                  <IconInfo />
                </div>
                <p className="account-password-status">{resetRequestMessage}</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`account-option-row${activeSection === 'resetPassword' ? ' account-option-row--active' : ''}`}
              onClick={handleResetPasswordBoxClick}
            >
              <span className="account-box-title">
                Reset Password
                {resetRequestCount > 0 && <span className="account-box-count">{resetRequestCount}</span>}
              </span>
              <IconChevronRight />
            </button>
          ))}
        </div>
        </div>

        <div className="account-col--main">
          {activeSection === 'resetPassword' ? (
            <div className="account-reset-panel">
              {/* TODO: once the reset-request list endpoint exists, render
                  it here, above the two info groups below. */}
              <div className="account-reset-groups">
                <div className="account-reset-group">
                  <p className="account-reset-group-title">{resetGroupLabel}</p>
                  <ul className="account-reset-group-list">
                    <li>{resetGroupLabel} cannot reset their password on their own.</li>
                    <li>Their request to reset password will appear here.</li>
                    <li>
                      When you reset, their password will change to default{' '}
                      <span className="account-reset-id">Id@{customerAcronym}</span>.
                    </li>
                    <li>Re-login will prompt them to change their default password.</li>
                  </ul>
                </div>
                <div className="account-reset-group">
                  <p className="account-reset-group-title">You</p>
                  <ul className="account-reset-group-list">
                    <li>You can reset your password if you forget.</li>
                    <li>A verification code will be emailed to you.</li>
                    <li>
                      Your password will be reset to default{' '}
                      <span className="account-reset-id">{userName}@{customerAcronym}</span>.
                    </li>
                    <li>Re-login will prompt you to change the default password.</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
          <form className={`account-password-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleSubmit} noValidate>
            {isDefaultPassword ? (
              <p className="account-password-status">
                You have not changed your default password. Change it now.
              </p>
            ) : passwordDateCreated ? (
              <p className="account-password-status">
                You last changed your password on {formatDate(new Date(passwordDateCreated))}.
              </p>
            ) : null}

            {/* Required to change the password, except while it's still the
                default one — per Account Rules, a default-password user
                isn't asked to re-enter it. */}
            {!isDefaultPassword && (
              <Field label="Current Password" required error={!!errors.current_password}>
                <input
                  className="su-input"
                  type="password"
                  autoComplete="current-password"
                  value={form.current_password}
                  onChange={ev => set('current_password', ev.target.value)}
                />
              </Field>
            )}

            <Field label="New Password" required error={!!errors.new_password}>
              <input
                className="su-input"
                type="password"
                autoComplete="new-password"
                value={form.new_password}
                onChange={ev => set('new_password', ev.target.value)}
              />
            </Field>

            <Field label="Confirm New Password" required error={!!errors.confirm_password}>
              <input
                className="su-input"
                type="password"
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={ev => set('confirm_password', ev.target.value)}
              />
            </Field>

            <div className="account-password-policy">
              <p className="account-password-policy-title">
                Your password must follow the security policy given below:
              </p>
              <ul className="account-password-policy-list">
                <li>At least 6 characters</li>
                <li>At least 1 letter and 1 number</li>
                {!isStudent && <li>At least 1 special character (e.g. <code>!</code>, <code>@</code>, <code>#</code>)</li>}
              </ul>
            </div>

            <div className="account-actions">
              <button className="account-save-btn" type="submit" disabled={busy}>
                <span style={{ visibility: busy ? 'hidden' : 'visible' }}>Save Password</span>
                {busy && (
                  <span className="account-save-overlay">
                    <span className="account-spinner" role="status" aria-label="Saving" />
                  </span>
                )}
              </button>
              {resultError && <span className="account-error">{resultError}</span>}
              {successMessage && <span className="account-success"><IconCheck />{successMessage}</span>}
            </div>
          </form>
          )}
        </div>
      </div>
      {/* Real bottom space, not padding-bottom on the scrolling ancestor —
          padding-bottom on an element that scrolls (or sits inside one
          whose scrollHeight it contributes to) has proven unreliable here
          across a few different container/overflow combinations; a plain
          in-flow element's own height is not. */}
      <div className="account-bottom-spacer" aria-hidden="true" />
    </div>
  )
}

const CUSTOMER_RULES = {
  customer_name: { label: 'School/Group Name', required: true },
  customer_address: { label: 'Address', required: true },
  customer_city: { label: 'City', required: true },
  customer_state_id: { label: 'State', required: true },
  customer_zip: { label: 'Zip', required: true },
  customer_email: { label: 'Email', required: true },
  customer_phone: { label: 'Phone', required: true },
}

const CUSTOMER_FIELDS = {
  customer_name: '',
  customer_address: '',
  customer_city: '',
  customer_state_id: '',
  customer_zip: '',
  customer_email: '',
  customer_phone: '',
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
  // Fetched by the time this page is reachable at all — LeftNav's Account
  // click awaits fetchAccountData() before navigating here, so this
  // resolves immediately below (its own already-loaded/in-flight check
  // short-circuits). Still called again on mount as a safety net for a
  // direct URL visit/refresh, which skips that click entirely.
  const customer = useAccountStore(s => s.customer)
  const states = useAccountStore(s => s.states)
  const accountStatus = useAccountStore(s => s.status)
  const accountError = useAccountStore(s => s.error)
  const fetchAccountData = useAccountStore(s => s.fetchAccountData)
  const setStoredCustomer = useAccountStore(s => s.setCustomer)
  const [form, setForm] = useState(CUSTOMER_FIELDS)
  const [busy, setBusy] = useState(false)
  const [resultError, setResultError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [networkError, setNetworkError] = useState('')
  const { errors, validate, clearError, isShaking } = useValidation(CUSTOMER_RULES)
  const isDirty = customer != null && Object.keys(CUSTOMER_FIELDS).some(key => form[key] !== customerToForm(customer)[key])

  // Kicks off the fetch (a no-op if the store's already loaded/in flight —
  // e.g. LeftNav's Account click already awaited it). Deliberately doesn't
  // populate `form` from the result here — see the render-time sync below
  // for why.
  useEffect(() => {
    fetchAccountData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Populating `form` from a .then() callback tied to *this* effect
  // invocation's own promise broke under StrictMode's double-invoked
  // effects: on a real fetch (a cold refresh — a same-session click has
  // already resolved this before navigating here), the second invocation's
  // fetchAccountData() call no-ops instantly (status is already 'loading'
  // from the first), so its callback ran before real data arrived, while
  // the first invocation's own callback got skipped by its cleanup's
  // `cancelled` flag — net result, `form` never got populated even though
  // the store's `customer` loaded correctly. Syncing during render instead
  // (React's documented "adjusting state when a prop changes" pattern) ties
  // this to the actual VALUE of `customer`, not to any one effect
  // invocation's timing, so it's immune to that race.
  const [syncedCustomer, setSyncedCustomer] = useState(null)
  if (customer !== syncedCustomer) {
    setSyncedCustomer(customer)
    if (customer != null) {
      const next = customerToForm(customer)
      // customer_state_id comes back null for any account created before
      // this feature (or whose customer row simply has none set yet) —
      // default to the first state rather than showing a blank
      // "Select..." option.
      if (!next.customer_state_id && states.length > 0) next.customer_state_id = states[0].id
      setForm(next)
    }
  }

  // Same render-time-sync approach, for the fetch's own error/recovery —
  // surfaces accountStore's error the moment status flips to 'error', and
  // clears it again once a retry (see LeftNav.jsx's handleNav, or another
  // mount) succeeds.
  const [syncedAccountStatus, setSyncedAccountStatus] = useState(accountStatus)
  if (accountStatus !== syncedAccountStatus) {
    setSyncedAccountStatus(accountStatus)
    if (accountStatus === 'error' && accountError) {
      setNetworkError(accountError)
    } else if (accountStatus === 'loaded') {
      setNetworkError('')
    }
  }

  function handleStateChange(stateId) {
    setForm(f => ({ ...f, customer_state_id: Number(stateId) }))
    clearError('customer_state_id')
    setResultError('')
    setSuccessMessage('')
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    clearError(field)
    setResultError('')
    setSuccessMessage('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Validate first — otherwise an unchanged form (e.g. required fields
    // still empty from before this section required them) would return
    // here before validate() ever ran, silently skipping the shake/red-
    // border feedback entirely.
    if (!validate(form)) return
    if (!isDirty) {
      // Valid, but nothing changed — same success feedback, no API call.
      setSuccessMessage('Account data saved')
      setTimeout(() => setSuccessMessage(''), 3000)
      return
    }
    setBusy(true)
    setResultError('')
    setSuccessMessage('')
    try {
      const updated = await updateMyCustomer(form)
      setStoredCustomer(updated)
      setSuccessMessage('Account data saved')
      setTimeout(() => setSuccessMessage(''), 3000)
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
    // .account-scroll-content is always flex-column (unconditionally, not
    // dependent on the row/column toggle inside .account-section) so the
    // bottom spacer always lands below it regardless of that toggle's
    // state — see the spacer's own comment for why it's a real element
    // rather than padding-bottom on the scrolling ancestor.
    <div className="account-scroll-content">
      <Toast message={networkError} onDismiss={() => setNetworkError('')} />

      {/* .account-section is itself the row (row on desktop, column once
          the two children can't fit side by side — see the @container
          rule). A Fragment, not an extra wrapper div, is what the
          customer-loaded condition needs here since it's just gating
          which 2 children render, same system as ChangePasswordSection. */}
      {customer && (
        <div className="account-section">
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
            {/* No onSubmit/type="submit" here (unlike ChangePasswordSection)
                — a real form-submit event, even with preventDefault(),
                still makes Chrome offer its native "Save this address?"
                autofill prompt on every click, since these fields
                (name/address/city/zip/phone/email) match its address-form
                heuristic. handleSubmit is called directly by the button's
                onClick instead, so no submit event is ever dispatched. */}
            <div className={`account-data-form${isShaking ? ' ui-shake' : ''}`}>
              {/* Fixed 2-column grid — every field is exactly one unit
                  wide, Name/Address explicitly span both units (2 field-
                  widths, not an unbounded full row), and the remaining
                  fields simply pair up two-per-row in the order they're
                  listed (City+State, Zip+Email, Phone). */}
              <div className="account-data-fields">
                <div className="account-data-field">
                  <Field label="School/Group Name" required error={!!errors.customer_name}>
                    <input className="su-input" type="text" value={form.customer_name}
                      onChange={ev => set('customer_name', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field account-data-field--wide account-data-field--row-start">
                  <Field label="Address" required error={!!errors.customer_address}>
                    <input className="su-input" type="text" value={form.customer_address}
                      onChange={ev => set('customer_address', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="City" required error={!!errors.customer_city}>
                    <input className="su-input" type="text" value={form.customer_city}
                      onChange={ev => set('customer_city', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="State" required error={!!errors.customer_state_id}>
                    <select className="su-input su-select" value={form.customer_state_id}
                      onChange={ev => handleStateChange(ev.target.value)} disabled={states.length === 0}>
                      {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="Zip" required error={!!errors.customer_zip}>
                    <input className="su-input" type="text" value={form.customer_zip}
                      onChange={ev => set('customer_zip', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="Email" required error={!!errors.customer_email}>
                    <input className="su-input" type="email" value={form.customer_email}
                      onChange={ev => set('customer_email', ev.target.value)} />
                  </Field>
                </div>

                <div className="account-data-field">
                  <Field label="Phone" required error={!!errors.customer_phone}>
                    <input className="su-input" type="tel" value={form.customer_phone}
                      onChange={ev => set('customer_phone', ev.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="account-actions">
                <button className="account-save-btn" type="button" onClick={handleSubmit} disabled={busy}>
                  <span style={{ visibility: busy ? 'hidden' : 'visible' }}>Save Changes</span>
                  {busy && (
                    <span className="account-save-overlay">
                      <span className="account-spinner" role="status" aria-label="Saving" />
                    </span>
                  )}
                </button>
                {resultError && <span className="account-error">{resultError}</span>}
                {successMessage && <span className="account-success"><IconCheck />{successMessage}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Real bottom space, not padding-bottom on the scrolling ancestor —
          padding-bottom on an element that scrolls (or sits inside one
          whose scrollHeight it contributes to) has proven unreliable here
          across a few different container/overflow combinations; a plain
          in-flow element's own height is not. */}
      <div className="account-bottom-spacer" aria-hidden="true" />
    </div>
  )
}
