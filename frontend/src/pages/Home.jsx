import { useNavigate } from 'react-router-dom'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="home-container">
      <div className="home-card">
        <h1 className="home-title">QToday</h1>
        <p className="home-subtitle">Welcome to QToday</p>
        <button className="login-btn" onClick={() => navigate('/dashboard')}>
          Login
        </button>
      </div>
    </div>
  )
}
