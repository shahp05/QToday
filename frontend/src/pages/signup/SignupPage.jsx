import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useValidation } from '../../hooks/useValidation'
import { Toast }         from '../../components/ui/Toast'
import logo512      from '../../assets/logo_512.webp'
import imgEnglish   from '../../assets/english.webp'
import imgMaths5    from '../../assets/maths-5.webp'
import imgEVS       from '../../assets/EVS.webp'
import imgSocial    from '../../assets/social-studies.webp'
import imgPhysics   from '../../assets/physics.webp'
import imgMaths12   from '../../assets/maths-12.webp'
import imgChem      from '../../assets/chemistry.webp'
import imgBio       from '../../assets/biology.webp'
import imgHistory   from '../../assets/history.webp'
import imgGeo       from '../../assets/geography.webp'
import imgCivics    from '../../assets/civics.webp'
import imgEcon      from '../../assets/economics.webp'
import imgCommerce  from '../../assets/commerce.webp'
import imgPsych     from '../../assets/psychology.webp'
import imgSociology from '../../assets/sociology.webp'
import imgPolSci    from '../../assets/political-science.webp'
import './SignupPage.css'

const API = 'http://localhost:8000/api'
const TTL = 60   // must match signup_verification_ttl_seconds in app_settings

// ── Validation rules ───────────────────────────────────────────────────────────
const SIGNUP_RULES = {
  user_name:        { label: 'Your name',           required: true },
  email_id:         { label: 'Email',               required: true,
                      validate: v => /\S+@\S+\.\S+/.test(v?.trim()) ? null : 'Enter a valid email address' },
  customer_name:    { label: 'School/group name',   required: true },
  customer_acronym: { label: 'Acronym',             required: true },
  org_id:           { label: 'Staff ID',            required: true },
  board_name:       { label: 'Education board',     required: true },
  country_code:     { label: 'Country',             required: true },
}

// ── Text backdrop ─────────────────────────────────────────────────────────────
function SignupBackdrop() {
  return (
    <div className="su-bd-text" aria-hidden="true">
      <span className="su-bd-w1">measure</span>
      <span className="su-bd-w2">learning</span>
      <span className="su-bd-w3">outcomes</span>
    </div>
  )
}

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
  )
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
  )
}
function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  )
}

function CtaBtn({ icon, children, variant, ...props }) {
  return (
    <button className={`su-cta-btn${variant ? ` su-cta-btn--${variant}` : ''}`} {...props}>
      <span className="su-cta-icon" aria-hidden="true">{icon}</span>
      <span className="su-cta-label">{children}</span>
      <span className="su-cta-spacer" aria-hidden="true" />
    </button>
  )
}

// ── Shared card header ─────────────────────────────────────────────────────────
function CardHeader({ title, subtitle }) {
  const navigate = useNavigate()
  return (
    <div className="su-card-header">
      <div className="su-title-text">
        <h1 className="su-title">{title}</h1>
        <p className="su-subtitle">{subtitle}</p>
      </div>
      <button className="su-close-btn" onClick={() => navigate(-1)} aria-label="Go back">✕</button>
    </div>
  )
}

// ── Step 1: signup form ────────────────────────────────────────────────────────
function SignupForm({ onCodeSent }) {
  const [form, setForm]           = useState({
    email_id: '', user_name: '', customer_name: '',
    customer_acronym: '', org_id: '', board_name: '', country_code: '',
  })
  const [countries, setCountries] = useState([])
  const [busy, setBusy]           = useState(false)
  const [toast, setToast]         = useState('')
  const firstRef                  = useRef(null)
  const { errors, validate, clearError, isShaking, hasErrors } = useValidation(SIGNUP_RULES)

  useEffect(() => {
    firstRef.current?.focus()
    fetch(`${API}/countries`)
      .then(r => r.json())
      .then(data => {
        setCountries(data)
        if (data.length > 0) set('country_code', data[0].code)
      })
      .catch(() => {})
  }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    clearError(field)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate(form)) return
    setBusy(true)
    try {
      const res = await fetch(`${API}/signup/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.detail || 'Something went wrong. Please try again.')
      }
      onCodeSent(form)
    } catch (err) {
      setToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CardHeader title="Create your account" subtitle="Measure Learning Outcomes" />
      <form className={`su-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleSubmit} noValidate>
        <div className="su-grid">
          <Field label="Your name" required span="full" error={!!errors.user_name}>
            <input
              ref={firstRef}
              className="su-input"
              type="text"
              placeholder="e.g. Mira Ma'm"
              value={form.user_name}
              onChange={ev => set('user_name', ev.target.value)}
            />
          </Field>

          <Field label="Your email id for verification" required span="full" error={!!errors.email_id}>
            <input
              className="su-input"
              type="email"
              placeholder="e.g. mira@dps.edu"
              value={form.email_id}
              onChange={ev => set('email_id', ev.target.value)}
            />
          </Field>

          <Field label="Your school/group name" required error={!!errors.customer_name}>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. Delhi Public School"
              value={form.customer_name}
              onChange={ev => set('customer_name', ev.target.value)}
            />
          </Field>

          <Field label="Your school/group acronym" required error={!!errors.customer_acronym}>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. DPS"
              maxLength={20}
              value={form.customer_acronym}
              onChange={ev => set('customer_acronym', ev.target.value.toUpperCase())}
            />
          </Field>

          <Field label="Your staff id" required error={!!errors.org_id}>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. 1001"
              value={form.org_id}
              onChange={ev => set('org_id', ev.target.value)}
            />
          </Field>

          <Field label="Your education board" required error={!!errors.board_name}>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. CBSE, IB, Cambridge IGCSE"
              value={form.board_name}
              onChange={ev => set('board_name', ev.target.value)}
            />
          </Field>

          <Field label="Your country" required span="full" error={!!errors.country_code}>
            <select
              className="su-input su-select"
              value={form.country_code}
              onChange={ev => set('country_code', ev.target.value)}
              disabled={countries.length === 0}
            >
              {countries.length === 0
                ? <option value="">Loading countries…</option>
                : countries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))
              }
            </select>
          </Field>
        </div>

        <p className="su-status-line">Fields marked <span className="su-required">*</span> must be filled</p>

        <div className="su-btn-wrap">
          <CtaBtn icon={<IconArrow />} type="submit" disabled={busy}>
            Continue
          </CtaBtn>
        </div>
      </form>

      <Toast message={toast} onDismiss={() => setToast('')} />
    </>
  )
}

// ── Step 2: OTP verify ─────────────────────────────────────────────────────────
function VerifyForm({ formData, onSuccess }) {
  const [code, setCode]           = useState('')
  const [timeLeft, setTimeLeft]   = useState(TTL)
  const [expired, setExpired]     = useState(false)
  const [busy, setBusy]           = useState(false)
  const [resending, setResending] = useState(false)
  const [msg, setMsg]             = useState('')
  const [msgType, setMsgType]     = useState('error')
  const [codeError, setCodeError] = useState(false)
  const [isShaking, setShaking]   = useState(false)
  const inputRef                  = useRef(null)
  const timerRef                  = useRef(null)
  const shakeTimer                = useRef(null)

  function startTimer() {
    clearInterval(timerRef.current)
    setTimeLeft(TTL)
    setExpired(false)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setExpired(true); return 0 }
        return t - 1
      })
    }, 1000)
  }

  useEffect(() => {
    inputRef.current?.focus()
    startTimer()
    return () => clearInterval(timerRef.current)
  }, [])

  function shake() {
    clearTimeout(shakeTimer.current)
    setShaking(true)
    shakeTimer.current = setTimeout(() => setShaking(false), 450)
  }

  async function handleVerify(e) {
    e.preventDefault()
    if (!code.trim()) { setCodeError(true); setMsg('Enter verification code'); setMsgType('error'); shake(); return }
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`${API}/signup/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_id: formData.email_id, code: code.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 410 || j.detail === 'expired') {
        setExpired(true)
        setMsg('Your code has expired. Request a new one.')
        setMsgType('error')
        return
      }
      if (!res.ok) {
        setMsg(j.detail || 'Incorrect code. Please try again.')
        setMsgType('error')
        return
      }
      onSuccess(j)
    } catch (err) {
      setMsg(`Network error: ${err.message}`)
      setMsgType('error')
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setMsg('')
    setCode('')
    try {
      const res = await fetch(`${API}/signup/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!res.ok) throw new Error()
      setMsg('A new code has been sent to your email.')
      setMsgType('info')
      startTimer()
    } catch {
      setMsg('Could not resend. Please try again.')
      setMsgType('error')
    } finally {
      setResending(false)
    }
  }

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')

  return (
    <>
      <CardHeader
        title="Check your email"
        subtitle={`Verification code sent to ${formData.email_id}`}
      />
      <form className={`su-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleVerify} noValidate>
        <div className="su-otp-wrap">
          <input
            ref={inputRef}
            className={`su-input su-otp-input${expired ? ' su-input--expired' : ''}${codeError ? ' su-input--error' : ''}`}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => { setCodeError(false); setMsg(''); setCode(e.target.value.replace(/\D/g, '').slice(0, 6)) }}
            disabled={expired}
          />

          <div className={`su-timer${msg && msgType === 'info' ? ' su-timer--info' : ''}`}>
            {msg
              ? msg
              : !expired
                ? <><span className="su-timer-dot" />Code expires in <strong>{mins}:{secs}</strong></>
                : 'Code expired'
            }
          </div>
        </div>

        <div className="su-btn-wrap">
          {!expired ? (
            <CtaBtn icon={<IconCheck />} type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & create account'}
            </CtaBtn>
          ) : (
            <CtaBtn icon={<IconRefresh />} type="button" onClick={handleResend} disabled={resending}>
              {resending ? 'Sending…' : 'Send a new verification code'}
            </CtaBtn>
          )}
        </div>
      </form>
    </>
  )
}

// ── Success splash ─────────────────────────────────────────────────────────────
function SuccessSplash({ formData, onContinue }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 2500)
    return () => clearTimeout(t)
  }, [onContinue])

  return (
    <>
      <CardHeader title="You're in!" subtitle="Taking you to your dashboard…" />
      <div className="su-form su-success">
        <div className="su-success-icon">✓</div>
        <p className="su-success-name">Welcome, {formData.user_name}</p>
        <p className="su-success-org">{formData.customer_name}</p>
      </div>
    </>
  )
}

// ── Field helper ──────────────────────────────────────────────────────────────
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

// ── Root ──────────────────────────────────────────────────────────────────────
export default function SignupPage() {
  const [step, setStep]         = useState('form')
  const [formData, setFormData] = useState(null)
  const navigate                = useNavigate()

  return (
    <div className="su-page">
      <div className="su-card">
        {step === 'form' && (
          <SignupForm onCodeSent={data => { setFormData(data); setStep('verify') }} />
        )}
        {step === 'verify' && (
          <VerifyForm formData={formData} onSuccess={() => setStep('success')} />
        )}
        {step === 'success' && (
          <SuccessSplash formData={formData} onContinue={() => navigate('/dashboard', { replace: true })} />
        )}

        <p className="su-login-link">
          Already have an account?{' '}
          <button className="btn btn-link" onClick={() => navigate('/')}>Log in</button>
        </p>
      </div>

      <div className="su-bg-decoration" aria-hidden="true">
        <img src={logo512} className="su-blob--logo" alt="" />
        <img src={logo512} className="su-blob--logo-2" alt="" />
        <SignupBackdrop />
      </div>
    </div>
  )
}
