import { useNavigate } from 'react-router-dom'
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

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  return (
    <div className="su-page">
      <div className="su-card">
        <div className="su-card-header">
          <div className="su-title-text">
            <h1 className="su-title">Reset Password</h1>
          </div>
          <button className="su-close-btn" onClick={() => navigate('/login')} aria-label="Go back">✕</button>
        </div>

        <div className="lg-form">
          <p className="lg-reset-notice">
            Self-service password reset is coming soon. Until then, ask your teacher or parent to
            reset your password to the default from their Account page.
          </p>
        </div>

        <p className="su-login-link">
          <button className="btn btn-link" onClick={() => navigate('/login')}>Back to Login</button>
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
