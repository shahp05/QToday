import { useUI } from '../context/UIContext'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo_48.webp'
import './LeftNav.css'

function IconAccount({ size }) {
  // Person inside a square frame — account_box
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2zm12 4c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zm-9 8c0-2 4-3.1 6-3.1s6 1.1 6 3.1v1H6v-1z"/>
    </svg>
  )
}

function IconLogout({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
    </svg>
  )
}

const INFO_BLOCKS = [
  { label: 'Grades',  value: '1 – 12' },
  { label: 'Board',   value: 'CBSE'   },
  { label: 'Country', value: 'India'  },
]

export default function LeftNav() {
  const { activePage, setActivePage } = useUI()
  const navigate = useNavigate()

  return (
    <aside className="leftnav" aria-label="School info and navigation">

      {/* ── Logo — height matches top icon bar ────────────────────────────── */}
      <div className="leftnav-logo-cell">
        <img src={logo} alt="QToday" className="leftnav-logo-img" />
      </div>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <nav className="leftnav-items">
        <button
          className={`leftnav-item ${activePage === 'account' ? 'leftnav-item--active' : ''}`}
          onClick={() => setActivePage('account')}
          aria-label="Account"
        >
          <IconAccount size="var(--nav-icon-size)" />
          <span className="leftnav-item-label">Account</span>
        </button>
      </nav>

      <div className="leftnav-spacer" />

      {/* ── School info blocks ────────────────────────────────────────────── */}
      <div className="leftnav-info">
        {INFO_BLOCKS.map(({ label, value }) => (
          <div key={label} className="leftnav-info-block">
            <span className="leftnav-info-label">{label}</span>
            <span className="leftnav-info-value">{value}</span>
          </div>
        ))}
      </div>

      {/* ── Logout ────────────────────────────────────────────────────────── */}
      <button
        className="leftnav-item leftnav-item--logout"
        onClick={() => navigate('/')}
        aria-label="Logout"
      >
        <IconLogout size="var(--leftnav-icon-size)" />
        <span className="leftnav-item-label">Logout</span>
      </button>

    </aside>
  )
}
