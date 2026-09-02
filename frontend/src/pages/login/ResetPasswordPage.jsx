import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  checkLoginKey, requestResetCode, verifyResetCode, raiseStudentResetRequest,
} from '../../services/resetPasswordService'
import { completeLogin } from '../../lib/postLogin'
import { Toast } from '../../components/ui/Toast'
import logo512 from '../../assets/logo_512.webp'
import './LoginPage.css'

const TTL = 60 // must match password_reset_verification_ttl_seconds in app_settings

function ResetBackdrop() {
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

function CtaBtn({ icon, children, ...props }) {
  return (
    <button className="su-cta-btn" {...props}>
      <span className="su-cta-icon" aria-hidden="true">{icon}</span>
      <span className="su-cta-label">{children}</span>
      <span className="su-cta-spacer" aria-hidden="true" />
    </button>
  )
}

// Same su-page/su-card shell as Login/Signup (header band, blobs backdrop,
// footer links back to the other two) — this used to be a modal on top of
// Login, but that read as two dialogs colliding rather than one page in the
// same family as Login/Signup, which is the look this should actually match.
// Steps: 'loginId' -> ('studentMessage' | 'verify'). A successful verify
// auto-logs the user in (completeLogin navigates to /dashboard itself, same
// as a real login), so there's no separate "done" step.
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState('loginId')
  const [loginKey, setLoginKey] = useState('')
  const [loginKeyError, setLoginKeyError] = useState(false)
  const [isShaking, setShaking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const firstRef = useRef(null)
  const shakeTimer = useRef(null)

  useEffect(() => {
    if (step === 'loginId') firstRef.current?.focus()
  }, [step])

  useEffect(() => () => clearTimeout(shakeTimer.current), [])

  function shake() {
    clearTimeout(shakeTimer.current)
    setShaking(true)
    shakeTimer.current = setTimeout(() => setShaking(false), 450)
  }

  async function handleLoginIdSubmit(e) {
    e.preventDefault()
    if (!loginKey.trim()) {
      setLoginKeyError(true)
      shake()
      return
    }
    setBusy(true)
    setToast('')
    try {
      const { is_student } = await checkLoginKey(loginKey.trim())
      if (is_student) {
        await raiseStudentResetRequest(loginKey.trim())
        setStep('studentMessage')
      } else {
        await requestResetCode(loginKey.trim())
        setStep('verify')
      }
    } catch (err) {
      setToast(err.message)
      setLoginKeyError(true)
      shake()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="su-page">
      <div className="su-card">
        <div className="su-card-header">
          <div className="su-title-text">
            <h1 className="su-title">{step === 'verify' ? 'Check your email' : 'Reset Password'}</h1>
          </div>
          <button className="su-close-btn" onClick={() => navigate('/login')} aria-label="Go back">✕</button>
        </div>

        {step === 'loginId' && (
          <form className={`lg-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleLoginIdSubmit} noValidate>
            <p className="lg-notice">Enter your login ID to reset your password.</p>
            <div className={`lg-field${loginKeyError ? ' su-field--error' : ''}`}>
              <label className="su-label">Login ID</label>
              <input
                ref={firstRef}
                className="su-input"
                type="text"
                placeholder="e.g. 101@TSRS"
                value={loginKey}
                onChange={e => { setLoginKey(e.target.value); setLoginKeyError(false) }}
              />
            </div>
            <div className="su-btn-wrap">
              <CtaBtn icon={<IconArrow />} type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Continue'}
              </CtaBtn>
            </div>
          </form>
        )}

        {step === 'studentMessage' && (
          <div className="lg-form">
            <p className="lg-notice">
              Your parent/teacher can reset your password to <strong>{loginKey.trim()}</strong>.
            </p>
            <div className="su-btn-wrap">
              <CtaBtn icon={<IconCheck />} type="button" onClick={() => navigate('/login')}>Back to Login</CtaBtn>
            </div>
          </div>
        )}

        {step === 'verify' && <VerifyStep loginKey={loginKey.trim()} navigate={navigate} />}

        <p className="su-login-link lg-login-links">
          <span className="lg-login-links-item">
            Remembered it?{' '}
            <button className="btn btn-link" onClick={() => navigate('/login')}>Login</button>
          </span>
          <span className="lg-login-links-item">
            New here?{' '}
            <button className="btn btn-link" onClick={() => navigate('/signup')}>Create an account</button>
          </span>
        </p>

        <Toast message={toast} onDismiss={() => setToast('')} />
      </div>

      <div className="su-bg-decoration" aria-hidden="true">
        <img src={logo512} className="su-blob--logo" alt="" />
        <img src={logo512} className="su-blob--logo-2" alt="" />
        <ResetBackdrop />
      </div>
    </div>
  )
}

// Same OTP pattern as SignupPage's VerifyForm (countdown, resend, shake on
// bad code) — pointed at the reset-password verify/request endpoints. A
// successful verify auto-logs the user in (per spec) via the same
// completeLogin helper LoginPage itself uses, since /reset-password/verify
// returns the same {access_token, profile} shape /login does.
function VerifyStep({ loginKey, navigate }) {
  const [code, setCode] = useState('')
  const [timeLeft, setTimeLeft] = useState(TTL)
  const [expired, setExpired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('error')
  const [codeError, setCodeError] = useState(false)
  const [isShaking, setShaking] = useState(false)
  const inputRef = useRef(null)
  const timerRef = useRef(null)
  const shakeTimer = useRef(null)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (!code.trim()) { setCodeError(true); shake(); return }
    setBusy(true)
    setMsg('')
    try {
      const { access_token, profile } = await verifyResetCode(loginKey, code.trim())
      const result = await completeLogin(profile, access_token, navigate)
      if (!result.ok) {
        setMsg(result.message)
        setMsgType('error')
        shake()
      }
    } catch (err) {
      setMsg(err.message)
      setMsgType('error')
      setCodeError(true)
      shake()
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setMsg('')
    setCode('')
    try {
      await requestResetCode(loginKey)
      setMsg('A new code has been sent to your email.')
      setMsgType('info')
      startTimer()
    } catch (err) {
      setMsg(err.message)
      setMsgType('error')
    } finally {
      setResending(false)
    }
  }

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')

  return (
    <form className={`lg-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleVerify} noValidate>
      <p className="lg-notice">Verification code sent to {loginKey}'s email.</p>
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
            {busy ? 'Verifying…' : 'Verify & Reset Password'}
          </CtaBtn>
        ) : (
          <CtaBtn icon={<IconRefresh />} type="button" onClick={handleResend} disabled={resending}>
            {resending ? 'Sending…' : 'Send a new verification code'}
          </CtaBtn>
        )}
      </div>
    </form>
  )
}
