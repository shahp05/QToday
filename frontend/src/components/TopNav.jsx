import { useUI } from '../context/UIContext'
import './TopNav.css'

/* ─── Icons ───────────────────────────────────────────────────────────────── */

function IconStudents({ size }) {
  // Graduation cap — represents learners/students
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/>
    </svg>
  )
}

function IconTeachers({ size }) {
  // Person above an open book — library/instructor icon, clearly educational
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 11.55C9.64 9.35 6.48 8 3 8v11c3.48 0 6.64 1.35 9 3.55 2.36-2.19 5.52-3.55 9-3.55V8c-3.48 0-6.64 1.35-9 3.55z"/>
      <path d="M12 8c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"/>
    </svg>
  )
}

function IconSubjects({ size }) {
  // Category (triangle + circle + square) — distinct subject areas
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l-5.5 9h11L12 2zm0 3.84L13.93 9h-3.87L12 5.84zM17.5 13c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zM3 21.5h8v-8H3v8zm2-6h4v4H5v-4z"/>
    </svg>
  )
}

function IconAccount({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
    </svg>
  )
}


const NAV_ITEMS = [
  { id: 'students', label: 'Students', Icon: IconStudents },
  { id: 'teachers', label: 'Teachers', Icon: IconTeachers },
  { id: 'subjects', label: 'Subjects', Icon: IconSubjects },
]

/* ─── Component ───────────────────────────────────────────────────────────── */

export default function TopNav() {
  const { activePage, setActivePage } = useUI()

  return (
    <nav className="topnav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`topnav-item ${activePage === id ? 'topnav-item--active' : ''}`}
          onClick={() => setActivePage(id)}
          aria-label={label}
          aria-current={activePage === id ? 'page' : undefined}
        >
          <span className="topnav-icon">
            <Icon size="var(--nav-icon-size)" />
          </span>
          <span className="topnav-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
