import './EmptyFeatureState.css'

// Shown instead of a page's normal content when it has nothing to display —
// no PageHeader, just the feature's own icon above a centered message,
// styled like LoginQuote's quote (same font/color/width — see
// EmptyFeatureState.css), so it reads as a deliberate state, not a
// half-loaded page.
export default function EmptyFeatureState({ icon, message }) {
  return (
    <div className="empty-feature-state">
      {icon}
      <p className="empty-feature-state-message">{message}</p>
    </div>
  )
}
