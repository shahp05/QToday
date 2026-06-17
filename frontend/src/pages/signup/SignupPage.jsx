import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../../assets/logo_192.webp'
import './SignupPage.css'

const API = 'http://localhost:8000/api'
const TTL = 60   // must match signup_verification_ttl_seconds in app_settings

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
  )
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
  )
}
function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  )
}

function CtaBtn({ icon, children, ...props }) {
  return (
    <button className="su-cta-btn" {...props}>
      <span className="su-cta-icon" aria-hidden="true">{icon}</span>
      <span className="su-cta-label">{children}</span>
      <span className="su-cta-spacer" aria-hidden="true" />
    </button>
  )
}

// ── Shared card header ─────────────────────────────────────────────────────────
function CardHeader({ title, subtitle }) {
  return (
    <div className="su-card-header">
      <img src={logo} alt="" className="su-logo-ghost" aria-hidden="true" />
      <div className="su-title-text">
        <h1 className="su-title">{title}</h1>
        <p className="su-subtitle">{subtitle}</p>
      </div>
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
  const [error, setError]         = useState('')
  const firstRef                  = useRef(null)

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
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const missing = ['email_id','user_name','customer_name','customer_acronym','org_id','board_name']
      .filter(k => !form[k].trim())
    if (missing.length)     { setError('Please fill in all required fields.'); return }
    if (!form.country_code) { setError('Please select a country.'); return }
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
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <CardHeader title="Create your account" subtitle="Manage Learning Outcomes" />
      <form className="su-form" onSubmit={handleSubmit} noValidate>
        <div className="su-grid">
          <Field label="Your name" required span="full">
            <input
              ref={firstRef}
              className="su-input"
              type="text"
              placeholder="e.g. Mira Ma'm"
              value={form.user_name}
              onChange={e => set('user_name', e.target.value)}
            />
          </Field>

          <Field label="Your email id for verification" required span="full">
            <input
              className="su-input"
              type="email"
              placeholder="you@school.edu"
              value={form.email_id}
              onChange={e => set('email_id', e.target.value)}
            />
          </Field>

          <Field label="Your school/group name" required>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. Delhi Public School"
              value={form.customer_name}
              onChange={e => set('customer_name', e.target.value)}
            />
          </Field>

          <Field label="Your school/group acronym" required>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. DPS"
              maxLength={20}
              value={form.customer_acronym}
              onChange={e => set('customer_acronym', e.target.value.toUpperCase())}
            />
          </Field>

          <Field label="Your staff id" required>
            <input
              className="su-input"
              type="text"
              placeholder="1001"
              value={form.org_id}
              onChange={e => set('org_id', e.target.value)}
            />
          </Field>

          <Field label="Your education board" required>
            <input
              className="su-input"
              type="text"
              placeholder="e.g. CBSE, IB, Cambridge IGCSE"
              value={form.board_name}
              onChange={e => set('board_name', e.target.value)}
            />
          </Field>

          <Field label="Your country" required span="full">
            <select
              className="su-input su-select"
              value={form.country_code}
              onChange={e => set('country_code', e.target.value)}
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

        {error && <p className="su-error">{error}</p>}

        <div className="su-btn-wrap">
          <CtaBtn icon={<IconArrow />} type="submit" disabled={busy}>
            {busy ? 'Sending code…' : 'Continue'}
          </CtaBtn>
        </div>
      </form>
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
  const inputRef                  = useRef(null)
  const timerRef                  = useRef(null)

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

  async function handleVerify(e) {
    e.preventDefault()
    if (!code.trim()) return
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
    } catch {
      setMsg('Network error. Please try again.')
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
        subtitle={`Code sent to ${formData.email_id}`}
      />
      <form className="su-form" onSubmit={handleVerify} noValidate>
        <div className="su-otp-wrap">
          <input
            ref={inputRef}
            className={`su-input su-otp-input${expired ? ' su-input--expired' : ''}`}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={expired}
          />

          {!expired ? (
            <div className="su-timer">
              <span className={`su-timer-dot${timeLeft <= 10 ? ' su-timer-dot--warn' : ''}`} />
              Code expires in <strong>{mins}:{secs}</strong>
            </div>
          ) : (
            <div className="su-timer su-timer--expired">Code expired</div>
          )}
        </div>

        {msg && <p className={`su-msg su-msg--${msgType}`}>{msg}</p>}

        <div className="su-btn-wrap">
          {!expired ? (
            <CtaBtn icon={<IconCheck />} type="submit" disabled={busy || code.length < 6}>
              {busy ? 'Verifying…' : 'Verify & create account'}
            </CtaBtn>
          ) : (
            <CtaBtn icon={<IconRefresh />} type="button" onClick={handleResend} disabled={resending}>
              {resending ? 'Sending…' : 'Send a new code'}
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
function Field({ label, required, span, children }) {
  return (
    <div className={`su-field${span === 'full' ? ' su-field--full' : ''}`}>
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
          <SuccessSplash formData={formData} onContinue={() => navigate('/dashboard')} />
        )}

        <p className="su-login-link">
          Already have an account?{' '}
          <button className="btn btn-link" onClick={() => navigate('/')}>Log in</button>
        </p>
      </div>

      <div className="su-bg-decoration" aria-hidden="true">
        <div className="su-blob su-blob--1" />
        <div className="su-blob su-blob--2" />
      </div>
    </div>
  )
}
