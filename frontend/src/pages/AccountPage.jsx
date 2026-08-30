import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore } from '../store/profileStore'
import { resolveFileUrl, resolveApiError } from '../lib/api'
import { ErrorCode } from '../errors/errorCodes'
import { uploadMyPhoto } from '../services/photoService'
import { changeMyPassword } from '../services/passwordService'
import { formatDate } from '../lib/dateFormat'
import { useValidation } from '../hooks/useValidation'
import EditablePhoto from '../components/EditablePhoto'
import { Toast } from '../components/ui/Toast'
import PageHeader from '../components/PageHeader'
import { usePageView } from '../hooks/usePageView'
import './AccountPage.css'

// Minimal for now — just the self-photo-upload gap (spec 1.8) and the
// Change Password section (spec 1.9). The rest of this page's content
// (personal data, manage-school-account, billing) is deferred to when the
// Account page itself gets built out.
export default function AccountPage() {
  const navigate = useNavigate()
  usePageView('account') // every page-header page names itself in the URL
  const userName = useProfileStore(s => s.user_name)
  const photoUrl = useProfileStore(s => s.photo_url)
  const updateOwnPhoto = useProfileStore(s => s.updateOwnPhoto)
  const [error, setError] = useState('')

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
      />
      <div className="account-page-body">
        <ChangePasswordSection />
      </div>
      <Toast message={error} onDismiss={() => setError('')} />
    </div>
  )
}

// ── Field helper — same shape as SignupPage's, kept local since it's the
// only field-grouping this page needs. ─────────────────────────────────────
function Field({ label, required, error, children }) {
  return (
    <div className={`su-field${error ? ' su-field--error' : ''}`}>
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
    <svg className="account-password-success-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
    <div className="account-password-section">
      <Toast message={networkError} onDismiss={() => setNetworkError('')} />

      <p className="account-password-label">Change your password</p>

      <p className="account-password-status">
        {isDefaultPassword
          ? 'You are currently using your default (auto-generated) password.'
          : passwordDateCreated
            ? `Last changed on ${formatDate(new Date(passwordDateCreated))}`
            : null}
      </p>

      <form className={`account-password-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleSubmit} noValidate>
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

        <div className="account-password-actions">
          <button className="account-password-save-btn" type="submit" disabled={busy}>
            {busy ? <span className="account-password-spinner" role="status" aria-label="Saving" /> : 'Save password'}
          </button>
          {resultError && <span className="account-password-error">{resultError}</span>}
          {successMessage && <span className="account-password-success"><IconCheck />{successMessage}</span>}
        </div>
      </form>

      <p className="account-password-policy">
        Your new password must have at least 6 characters, with at least 1 letter and 1 number
        {!isStudent && <>, and at least 1 special character (e.g. <code>!</code>, <code>@</code>, <code>#</code>)</>}.
      </p>
    </div>
  )
}
