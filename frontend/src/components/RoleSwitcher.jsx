import { useState } from 'react'
import { useUI, ROLES, ROLE_LABELS } from '../context/UIContext'
import './RoleSwitcher.css'

export default function RoleSwitcher() {
  const { activeRole, setActiveRole } = useUI()
  const [open, setOpen] = useState(false)

  return (
    <div className="roleswitcher">
      <button
        className="roleswitcher-trigger"
        onClick={() => setOpen(o => !o)}
        title="DEV: switch role"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="roleswitcher-badge">DEV</span>
        <span className="roleswitcher-current">{ROLE_LABELS[activeRole]}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}>
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>

      {open && (
        <ul className="roleswitcher-menu" role="listbox" aria-label="Switch role">
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <li
              key={key}
              role="option"
              aria-selected={activeRole === key}
              className={`roleswitcher-option ${activeRole === key ? 'roleswitcher-option--active' : ''}`}
              onClick={() => { setActiveRole(key); setOpen(false) }}
            >
              {activeRole === key && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              )}
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
