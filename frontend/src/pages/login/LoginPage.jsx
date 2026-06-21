import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useProfileStore } from '../../store/profileStore'
import logo512 from '../../assets/logo_512.webp'
import './LoginPage.css'

function LoginBackdrop() {
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

export default function LoginPage() {
  const [loginKey, setLoginKey] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [isShaking, setShaking] = useState(false)
  const [hasError, setHasError] = useState(false)
  const firstRef                = useRef(null)
  const shakeTimer              = useRef(null)
  const navigate                = useNavigate()
  const setProfile              = useProfileStore(s => s.setProfile)

  useEffect(() => {
    firstRef.current?.focus()
    return () => clearTimeout(shakeTimer.current)
  }, [])

  function shake() {
    clearTimeout(shakeTimer.current)
    setHasError(true)
    setShaking(true)
    firstRef.current?.focus()
    shakeTimer.current = setTimeout(() => setShaking(false), 450)
  }

  function clearError() {
    if (hasError) setHasError(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!loginKey.trim() || !password) {
      shake()
      return
    }
    setBusy(true)
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_key: loginKey.trim(), password }),
      })
      if (!res.ok) {
        shake()
        return
      }
      const j = await res.json()
      setProfile(j.profile, j.access_token)
      navigate('/dashboard')
    } catch {
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
            <h1 className="su-title">Login</h1>
            <p className="su-subtitle">Concepts → Confidence → Competitiveness</p>
          </div>
          <button className="su-close-btn" onClick={() => navigate('/')} aria-label="Go back">✕</button>
        </div>

        <form className={`lg-form${isShaking ? ' ui-shake' : ''}`} onSubmit={handleSubmit} noValidate>
          <div className={`lg-field${hasError ? ' su-field--error' : ''}`}>
            <label className="su-label">Login ID</label>
            <input
              ref={firstRef}
              className="su-input"
              type="text"
              placeholder="e.g. 101@TSRS"
              value={loginKey}
              onChange={e => { setLoginKey(e.target.value); clearError() }}
            />
          </div>

          <div className={`lg-field${hasError ? ' su-field--error' : ''}`}>
            <label className="su-label">Password</label>
            <input
              className="su-input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={e => { setPassword(e.target.value); clearError() }}
            />
          </div>

          <div className="su-btn-wrap">
            <button className="su-cta-btn" type="submit" disabled={busy}>
              <span className="su-cta-icon" aria-hidden="true"><IconArrow /></span>
              <span className="su-cta-label">{busy ? 'Logging in…' : 'Login'}</span>
              <span className="su-cta-spacer" aria-hidden="true" />
            </button>
          </div>
        </form>

        <p className="su-login-link">
          New here?{' '}
          <button className="btn btn-link" onClick={() => navigate('/signup')}>Create an account</button>
        </p>
      </div>

      <div className="su-bg-decoration" aria-hidden="true">
        <img src={logo512} className="su-blob--logo" alt="" />
        <img src={logo512} className="su-blob--logo-2" alt="" />
        <LoginBackdrop />
      </div>
    </div>
  )
}
