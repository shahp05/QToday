import './PageHeader.css'

function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// Shared sticky page header: back button + title + optional right-aligned
// actions, with an optional filter row underneath. Back button always
// renders (every page header has one) — onBack is a no-op until each
// page's back-navigation target is wired up.
export default function PageHeader({ title, onBack, actions, filter }) {
  return (
    <div className="page-header">
      <div className="page-header-title-row">
        <div className="page-header-title-group">
          <button className="page-header-back-btn" onClick={onBack ?? (() => {})} aria-label="Back">
            <IconBack />
          </button>
          <h2 className="page-header-title">{title}</h2>
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
      {filter && <div className="page-header-filter">{filter}</div>}
    </div>
  )
}
