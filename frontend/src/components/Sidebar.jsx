import './Sidebar.css'

const navItems = [
  { id: 'home', label: 'Home' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
]

export default function Sidebar({ activePage, onNavigate, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">QToday</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  )
}
